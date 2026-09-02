use std::env;
use std::time::Instant;
use thumb_rs::{get_thumbnail, ThumbnailScale};

fn main() {
    let file = env::args().nth(1).unwrap();
    println!("Loading thumbnail for: {}", file);
    let start = Instant::now();
    let thumb = get_thumbnail(&file, ThumbnailScale(10)).unwrap();
    println!("Got thumb: {}x{} in {:?}", thumb.width, thumb.height, start.elapsed());
}
