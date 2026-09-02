use std::env;
use std::time::Instant;
use thumb_rs::{get_thumbnail, ThumbnailScale};

fn main() {
    let file = env::args().nth(1).unwrap();
    for scale in [2, 4, 8, 10, 12, 16] {
        let start = Instant::now();
        match get_thumbnail(&file, ThumbnailScale(scale)) {
            Ok(thumb) => println!("Scale {}: {}x{} in {:?}", scale, thumb.width, thumb.height, start.elapsed()),
            Err(e) => println!("Scale {}: Error {:?}", scale, e),
        }
    }
}
