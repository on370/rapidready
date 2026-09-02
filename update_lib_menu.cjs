const fs = require('fs');
let path = 'src-tauri/src/lib.rs';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('pub mod menu;')) {
  content = content.replace('pub mod commands;', 'pub mod commands;\npub mod menu;');
}

const setupHook = `.setup(|app| {
            let handle = app.handle();
            if let Ok(menu) = menu::build_menu(handle) {
                app.set_menu(menu)?;
            }
            app.on_menu_event(move |app, event| {
                if event.id() == "open_help" {
                    let _ = app.emit("toggle-help-modal", ());
                }
            });
            Ok(())
        })`;

content = content.replace('.plugin(tauri_plugin_dialog::init())', '.plugin(tauri_plugin_dialog::init())\n        ' + setupHook);

fs.writeFileSync(path, content);
console.log('Updated lib.rs with menu');
