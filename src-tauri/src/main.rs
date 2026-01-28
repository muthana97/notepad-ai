// Prevents additional console window on Windows in release, do not remove!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::command;
use std::fs;
use std::path::PathBuf;
use regex::Regex;
use chrono;

// 1. THE COMMAND: This is what React calls via 'invoke("process_note")'
#[command]
async fn process_note(content: String, base_path: String) -> Result<String, String> {
    let re = Regex::new(r"(?m)^!(.*)").unwrap();
    
    // Setup paths
    let base = PathBuf::from(&base_path);
    let flash_ideas_path = base.join("flash_ideas");
    let inbox_path = base.join("inbox");

    // Create directories if they don't exist
    fs::create_dir_all(&flash_ideas_path).map_err(|e| e.to_string())?;
    fs::create_dir_all(&inbox_path).map_err(|e| e.to_string())?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();

    // A. Logic for "!" Branching
    for cap in re.captures_iter(&content) {
        let idea = cap[1].trim();
        let filename = format!("idea-{}.md", timestamp);
        fs::write(flash_ideas_path.join(filename), idea).map_err(|e| e.to_string())?;
    }

    // B. Save the Full Note
    let main_filename = format!("note-{}.md", timestamp);
    fs::write(inbox_path.join(main_filename), &content).map_err(|e| e.to_string())?;

    Ok("Janitor filed the note successfully.".into())
}

// 2. THE ENTRY POINT: This boots the actual application
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init()) // Essential for Tauri 2.0
        .invoke_handler(tauri::generate_handler![process_note]) // Register our command
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
