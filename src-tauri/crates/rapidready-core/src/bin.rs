use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedFileTest {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub date: Option<NaiveDateTime>,
    pub formatted_date: Option<String>,
    pub hash: String,
    pub already_imported: bool,
}

fn main() {
    let json = r#"{
        "path": "/some/path",
        "name": "file.jpg",
        "size": 1024,
        "date": "2023-01-01T12:00:00",
        "formatted_date": "2023-01-01 12:00:00",
        "hash": "abc",
        "already_imported": false,
        "selected": true
    }"#;
    let file: Result<ScannedFileTest, _> = serde_json::from_str(json);
    println!("{:?}", file);
}
