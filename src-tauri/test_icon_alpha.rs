use std::env;
use thumb_rs::{get_thumbnail, ThumbnailScale};

fn main() {
    let file = env::args().nth(1).unwrap();
    // Ask for a huge size to force an icon on an ARW file
    let thumb = get_thumbnail(&file, ThumbnailScale(16)).unwrap();
    println!("Size: {}x{}", thumb.width, thumb.height);
    println!("Pixel at 0,0: R={}, G={}, B={}, A={}", thumb.rgba[0], thumb.rgba[1], thumb.rgba[2], thumb.rgba[3]);
    
    // Ask for correct size to get real preview
    let thumb2 = get_thumbnail(&file, ThumbnailScale(4)).unwrap();
    println!("Size: {}x{}", thumb2.width, thumb2.height);
    println!("Pixel at 0,0: R={}, G={}, B={}, A={}", thumb2.rgba[0], thumb2.rgba[1], thumb2.rgba[2], thumb2.rgba[3]);
}
