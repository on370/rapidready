use std::path::Path;

/// Checks whether a camera model name indicates a physical monochrome/achromatic sensor.
pub fn is_monochrome_camera_model(model: &str) -> bool {
    let lower = model.to_lowercase();
    lower.contains("monochrom") || lower.contains("achromatic")
}

/// Checks whether an embedded JPEG preview is monochrome (grayscale or B/W camera picture profile).
pub fn is_embedded_preview_monochrome(path: &Path) -> bool {
    let thumb_bytes = match crate::thumbnail::extract_embedded_thumbnail(path, None) {
        Some(b) => b,
        None => return false,
    };

    // 1. Fast SOF marker check: If JPEG has only 1 component, it's definitively grayscale.
    if let Some(is_grayscale) = check_jpeg_grayscale_header(&thumb_bytes) {
        if is_grayscale {
            return true;
        }
    }

    // 2. Chroma analysis on decoded thumbnail for 3-component YCbCr/RGB B/W profiles.
    if let Ok(dyn_img) = image::load_from_memory(&thumb_bytes) {
        let rgb = dyn_img.to_rgb8();
        let raw = rgb.as_raw();
        if raw.is_empty() {
            return false;
        }

        let mut colored_samples = 0;
        let mut total_samples = 0;

        // Sample every 4th pixel (fast stride)
        for chunk in raw.chunks_exact(3).step_by(4) {
            total_samples += 1;
            let r = chunk[0] as i32;
            let g = chunk[1] as i32;
            let b = chunk[2] as i32;

            let diff = (r - g).abs().max((g - b).abs()).max((r - b).abs());
            // Chroma difference > 8 allows for 4:2:0 subsampling and compression artifacts in B/W photos
            if diff > 8 {
                colored_samples += 1;
                // Early exit: if more than 25 sampled pixels have significant color, it's definitely a color preview
                if colored_samples > 25 {
                    return false;
                }
            }
        }

        if total_samples > 0 && colored_samples <= 25 {
            return true;
        }
    }

    false
}

/// Inspects the JPEG header for SOF markers to check if the image has only 1 component (grayscale).
fn check_jpeg_grayscale_header(bytes: &[u8]) -> Option<bool> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }
    let mut pos = 2;
    while pos + 4 < bytes.len() {
        if bytes[pos] != 0xFF {
            pos += 1;
            continue;
        }
        let marker = bytes[pos + 1];
        if marker == 0xD8 || marker == 0xD9 || marker == 0x00 || (marker >= 0xD0 && marker <= 0xD7) {
            pos += 2;
            continue;
        }
        if pos + 4 > bytes.len() {
            break;
        }
        let length = ((bytes[pos + 2] as usize) << 8) | (bytes[pos + 3] as usize);
        if length < 2 || pos + 2 + length > bytes.len() {
            break;
        }
        // SOF markers: SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2), SOF3 (0xC3),
        // SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 (excluding DHT 0xC4, JPG 0xC8, DAC 0xCC)
        if (0xC0..=0xCF).contains(&marker) && marker != 0xC4 && marker != 0xC8 && marker != 0xCC {
            // Byte 9 of marker payload is number of components
            if pos + 9 < bytes.len() {
                let num_components = bytes[pos + 9];
                return Some(num_components == 1);
            }
        }
        pos += 2 + length;
    }
    None
}

/// Helper to get image dimensions without EXIF (fallback).
pub(super) fn get_dimensions_without_exif(path: &Path) -> Option<(u32, u32)> {
    image::image_dimensions(path).ok()
}
