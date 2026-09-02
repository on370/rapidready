use std::path::Path;
use std::io::Cursor;
use image::{ImageFormat, RgbaImage};
use thumb_rs::{get_thumbnail, ThumbnailScale};
use anyhow::{Context, Result};

pub fn get_preview_jpeg(path: &Path, scale: u32) -> Result<Vec<u8>> {
    
    // For standard images, we might just read them directly if scale is not requested,
    // but for thumbnails, it's actually faster to use thumb_rs which uses the OS cache.
    let thumb = get_thumbnail(path, ThumbnailScale(scale))
        .map_err(|e| anyhow::anyhow!("thumb_rs error: {:?}", e))?;
        
    let img = RgbaImage::from_raw(thumb.width, thumb.height, thumb.rgba)
        .context("Failed to construct RgbaImage from raw bytes")?;
        
    let mut buffer = Cursor::new(Vec::new());
    // Convert RGBA to RGB for JPEG to avoid issues and reduce size
    let rgb_img = image::DynamicImage::ImageRgba8(img).into_rgb8();
    
    // Write as JPEG (Quality 85 is a good balance for thumbnails)
    rgb_img.write_to(&mut buffer, ImageFormat::Jpeg)
        .context("Failed to encode JPEG")?;
        
    Ok(buffer.into_inner())
}


pub fn get_max_preview_jpeg(path: &Path) -> Result<Vec<u8>> {
    // macOS QLThumbnailGenerator returns a generic 1024x1024 or 512x512 file icon
    // if the requested scale is larger than the embedded preview.
    // We try descending scales to find the largest actual preview.
    let mut best_thumb = None;
    for scale in [16, 12, 8, 4, 2] {
        if let Ok(thumb) = get_thumbnail(path, ThumbnailScale(scale)) {
            // macOS generic document icons are perfectly square.
            // It's extremely rare for a RAW photo to be exactly 1024x1024 or 512x512.
            // A generic macOS document icon has transparent corners.
            // RAW photos NEVER have an alpha channel (transparency).
            // If the top-left pixel is fully transparent (Alpha == 0), it is guaranteed to be a generic icon or padded frame, not the raw photo.
            if thumb.rgba.len() >= 4 && thumb.rgba[3] == 0 {
                continue;
            }
            best_thumb = Some(thumb);
            break;
        }
    }
    
    let thumb = best_thumb.ok_or_else(|| anyhow::anyhow!("Failed to extract a valid preview"))?;
    
    let img = RgbaImage::from_raw(thumb.width, thumb.height, thumb.rgba)
        .context("Failed to construct RgbaImage from raw bytes")?;
        
    let mut buffer = Cursor::new(Vec::new());
    let rgb_img = image::DynamicImage::ImageRgba8(img).into_rgb8();
    
    rgb_img.write_to(&mut buffer, ImageFormat::Jpeg)
        .context("Failed to encode JPEG")?;
        
    Ok(buffer.into_inner())
}
