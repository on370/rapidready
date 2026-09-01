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
