// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `ruangku.exe --mcp`: jembatan stdio untuk Claude Desktop / klien MCP lain.
    if std::env::args().any(|a| a == "--mcp") {
        std::process::exit(ruangku_lib::mcp::run_stdio_bridge());
    }
    ruangku_lib::run()
}
