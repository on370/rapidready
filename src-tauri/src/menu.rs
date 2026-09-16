use tauri::AppHandle;
use tauri::menu::{Menu, Submenu, MenuItem, PredefinedMenuItem};

pub fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let about_item = MenuItem::with_id(
        app,
        "open_about",
        "About RapidReady",
        true,
        None::<&str>,
    )?;

    let check_updates_item = MenuItem::with_id(
        app,
        "check_updates",
        "Check for Updates...",
        true,
        None::<&str>,
    )?;

    let app_menu = Submenu::with_items(
        app,
        "RapidReady",
        true,
        &[
            &about_item,
            &check_updates_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view_import = MenuItem::with_id(
        app,
        "view_import",
        "Import",
        true,
        Some("CmdOrCtrl+1"),
    )?;

    let view_library = MenuItem::with_id(
        app,
        "view_library",
        "Library",
        true,
        Some("CmdOrCtrl+2"),
    )?;

    let view_settings = MenuItem::with_id(
        app,
        "view_settings",
        "Settings",
        true,
        Some("CmdOrCtrl+,"),
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &view_import,
            &view_library,
            &PredefinedMenuItem::separator(app)?,
            &view_settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::bring_all_to_front(app, None)?,
        ],
    )?;

    let help_item = MenuItem::with_id(
        app,
        "open_help",
        "RapidReady Help",
        true,
        Some("CmdOrCtrl+Shift+?"),
    )?;

    let check_updates_help_item = MenuItem::with_id(
        app,
        "check_updates_help",
        "Check for Updates...",
        true,
        None::<&str>,
    )?;

    let about_help_item = MenuItem::with_id(
        app,
        "open_about_help",
        "About RapidReady",
        true,
        None::<&str>,
    )?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &help_item,
            &PredefinedMenuItem::separator(app)?,
            &check_updates_help_item,
            &PredefinedMenuItem::separator(app)?,
            &about_help_item,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
}
