const fs = require('fs');
let path = 'src/menu.rs';
let content = fs.readFileSync(path, 'utf8');

const itemDef = `    let about_item = MenuItem::with_id(
        app,
        "open_about",
        "About RapidReady",
        true,
        None::<&str>,
    )?;`;

content = content.replace(itemDef + '\n\n', '');
content = content.replace('pub fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {\n', 'pub fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {\n' + itemDef + '\n\n');

fs.writeFileSync(path, content);
console.log('Fixed menu scope');
