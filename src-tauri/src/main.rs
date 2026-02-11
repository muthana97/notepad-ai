use tauri::{Emitter, Window, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use std::fs;
use std::path::Path;
use regex::Regex;

// --- SHARED SAVING FUNCTION ---
fn save_session_data(
    content: &str,
    session_id: &str,
    base_path: &str,
) -> Result<(), String> {
    let session_path = Path::new(base_path).join(format!("TEMP_{}", session_id));

    if !session_path.exists() {
        fs::create_dir_all(&session_path).map_err(|e| e.to_string())?;
    }

    // 1. Save master note
    fs::write(session_path.join("raw_note.txt"), content)
        .map_err(|e| e.to_string())?;

    // 2. Split sections
    let re = Regex::new(r"(?m)^\s*>>(.*)").unwrap();
    let mut last_idx = 0;
    let mut last_title: Option<String> = None;

    for cap in re.captures_iter(content) {
        let full_match = cap.get(0).unwrap();
        let title = cap
            .get(1)
            .unwrap()
            .as_str()
            .trim()
            .replace("/", "-");

        if let Some(name) = last_title {
            let section = &content[last_idx..full_match.start()];
            let _ = fs::write(
                session_path.join(format!("{}.txt", name)),
                section.trim(),
            );
        }

        last_idx = full_match.end();
        last_title = Some(title);
    }

    if let Some(name) = last_title {
        let section = &content[last_idx..];
        let _ = fs::write(
            session_path.join(format!("{}.txt", name)),
            section.trim(),
        );
    }

    Ok(())
}

#[tauri::command]
async fn process_note(
    content: String,
    session_id: String,
    base_path: String,
) -> Result<String, String> {
    save_session_data(&content, &session_id, &base_path)?;
    Ok(format!("Synced: {}", session_id))
}

#[tauri::command]
fn final_close_ready(window: Window) {
    println!("Final save confirmed by React. Closing window.");
    window.destroy().unwrap();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            process_note,
            final_close_ready
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let win = window.clone();

                window
                    .dialog()
                    .message("Keep this session?")
                    .kind(MessageDialogKind::Info)
                    .title("The Janitor")
                    .buttons(MessageDialogButtons::OkCancel)
                    .show(move |result| {
                        if result {
                            // Ask React to do a final save
                            win.emit("request-final-save", ()).unwrap();
                        } else {
                            win.destroy().unwrap();
                        }
                    });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
