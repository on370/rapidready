fn main() {
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/128x128@2x.png");
    println!("cargo:rerun-if-changed=src/macos_dock.m");

    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/macos_dock.m")
            .compile("macos_dock");
    }

    tauri_build::build()
}
