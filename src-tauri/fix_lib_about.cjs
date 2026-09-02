const fs = require('fs');

let path = 'src/lib.rs';
let content = fs.readFileSync(path, 'utf8');

const oldEvent = `            app.on_menu_event(move |app, event| {
                if event.id() == "open_help" {
                    let _ = app.emit("toggle-help-modal", ());
                }
            });`;

const newEvent = `            app.on_menu_event(move |app, event| {
                if event.id() == "open_help" {
                    let _ = app.emit("toggle-help-modal", ());
                } else if event.id() == "open_about" {
                    let _ = app.emit("toggle-about-modal", ());
                }
            });`;

content = content.replace(oldEvent, newEvent);

fs.writeFileSync(path, content);
console.log('Fixed lib.rs');
