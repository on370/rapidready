const fs = require('fs');
let path = 'crates/rapidready-core/src/thumbnail.rs';
let content = fs.readFileSync(path, 'utf8');

const newFn = `
pub fn get_max_preview_jpeg(path: &Path) -> Result<Vec<u8>> {
    // macOS QLThumbnailGenerator returns a generic 1024x1024 or 512x512 file icon
    // if the requested scale is larger than the embedded preview.
    // We try descending scales to find the largest actual preview.
    let mut best_thumb = None;
    for scale in [16, 12, 8, 4, 2] {
        if let Ok(thumb) = get_thumbnail(path, ThumbnailScale(scale)) {
            // macOS generic document icons are perfectly square.
            // It's extremely rare for a RAW photo to be exactly 1024x1024 or 512x512.
            if thumb.width == thumb.height && (thumb.width == 1024 || thumb.width == 512 || thumb.width == 256) {
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
`;

content = content + '\n' + newFn;
fs.writeFileSync(path, content);
console.log('Updated thumbnail.rs');
