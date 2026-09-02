const fs = require('fs');

let path = 'src/menu.rs';
let content = fs.readFileSync(path, 'utf8');

// Add about_item to Help menu
const oldHelpItem = `    let help_item = MenuItem::with_id(
        app,
        "open_help",
        "RapidReady Help",
        true,
        Some("CmdOrCtrl+Shift+?"),
    )?;`;

const newHelpItem = `    let about_item = MenuItem::with_id(
        app,
        "open_about",
        "About RapidReady",
        true,
        None::<&str>,
    )?;

    let help_item = MenuItem::with_id(
        app,
        "open_help",
        "RapidReady Help",
        true,
        Some("CmdOrCtrl+Shift+?"),
    )?;`;

content = content.replace(oldHelpItem, newHelpItem);

content = content.replace(
  '&[&help_item],',
  '&[&help_item, &PredefinedMenuItem::separator(app)?, &about_item],'
);

// We can leave the native PredefinedMenuItem::about in the App menu, it's standard Mac behavior to have it there.
// If the user clicks "About" in Help, it opens our React modal. 
// Actually, let's also make the App menu "About" trigger our modal instead of the native one!
const oldAppMenu = `&PredefinedMenuItem::about(app, None, None)?,`;
const newAppMenu = `&about_item,`;

content = content.replace(oldAppMenu, newAppMenu);

fs.writeFileSync(path, content);
console.log('Fixed menu.rs');
