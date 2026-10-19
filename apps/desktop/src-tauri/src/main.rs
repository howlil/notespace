// Use the GUI subsystem for packaged Windows builds. Otherwise Windows
// launches an extra console window; closing that console terminates Notespace.
// Keep the console in debug builds for development diagnostics.
#![cfg_attr(all(target_os = "windows", not(debug_assertions)), windows_subsystem = "windows")]

fn main() {
    notespace_desktop_lib::run();
}
