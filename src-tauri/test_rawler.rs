use rawler::RawFile;
use std::env;

fn main() {
    let file = env::args().nth(1).unwrap();
    println!("Loading raw file: {}", file);
    match RawFile::new(&file) {
        Ok(raw) => {
            println!("Got raw file! Previews: {}", raw.previews.len());
            for (i, p) in raw.previews.iter().enumerate() {
                println!("Preview {}: {}x{} ({} bytes, mime: {})", i, p.width, p.height, p.data.len(), p.mime_type);
            }
        },
        Err(e) => println!("Error: {:?}", e),
    }
}
