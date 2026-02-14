use tauri::{Emitter, Window, WindowEvent, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use walkdir::WalkDir;

struct AppState {
    current_session_id: Mutex<String>,
}

#[derive(Serialize)]
struct NotePreview {
    path: String,
    title: String,
    preview: String,
    modified: u64,
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    system: String,
    options: serde_json::Value,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

async fn clean_with_janitor(content: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let system_msg = "You are a text formatter. 1. Organize using Markdown. 2. DO NOT add info. 3. DO NOT include greetings. Return ONLY formatted text.";

    let body = OllamaRequest {
        model: "llama3.2:3b".to_string(),
        prompt: content.to_string(),
        stream: false,
        system: system_msg.to_string(),
        options: serde_json::json!({"temperature": 0.1, "num_predict": 1000}),
    };

    let res = client.post("http://localhost:11434/api/generate").json(&body).send().await
        .map_err(|e| format!("Network Error: {}", e))?;

    let json: OllamaResponse = res.json().await.map_err(|e| format!("JSON Error: {}", e))?;
    Ok(json.response.trim().to_string())
}

#[tauri::command]
fn get_recent_notes(base_path: String) -> Result<Vec<NotePreview>, String> {
    let mut notes = Vec::new();
    let path = Path::new(&base_path);
    if !path.exists() { return Ok(vec![]); }

    // We walk through the base folder
    for entry in WalkDir::new(path)
        .min_depth(1) // Look inside TEMP folders
        .max_depth(2) // Don't go too deep
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file()) 
    {
        let file_path = entry.path();
        let filename = file_path.file_name().and_then(|s| s.to_str()).unwrap_or("");

        // We only want to show the "Raw" note or the "Cleaned" note on the bulletin
        // Usually, showing the Cleaned version looks better!
        if filename == "cleaned_note.md" || filename == "raw_note.txt" {
            // If both exist, this logic might show two cards for one note.
            // Let's prioritize cleaned_note.md and skip raw_note.txt if cleaned exists.
            let parent = file_path.parent().unwrap();
            if filename == "raw_note.txt" && parent.join("cleaned_note.md").exists() {
                continue; 
            }

            let content = fs::read_to_string(file_path).unwrap_or_default();
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            
            notes.push(NotePreview {
                path: file_path.to_str().unwrap().to_string(),
                // Use the Folder Name (TEMP_...) as the title so the user knows which session it is
                title: parent.file_name().unwrap().to_str().unwrap().to_string(),
                preview: content.chars().take(100).collect(),
                modified: meta.modified().unwrap().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
            });
        }
    }
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(notes)
}

#[tauri::command]
async fn process_note(
    content: String, 
    session_id: String, 
    base_path: String,  
    state: tauri::State<'_, AppState>
) -> Result<String, String> {
    // 1. Sync Session ID
    {
        let mut current_id = state.current_session_id.lock().unwrap();
        *current_id = session_id.clone();
    } 

    // 2. Prepare Directory
    let session_path = Path::new(&base_path).join(format!("TEMP_{}", session_id));
    if !session_path.exists() {
        fs::create_dir_all(&session_path).map_err(|e| e.to_string())?;
    }

    // 3. Save Raw Note (Instant)
    fs::write(session_path.join("raw_note.txt"), &content).map_err(|e| e.to_string())?;

    // 4. FIRE AND FORGET: AI Cleaning in the background
    if !content.trim().is_empty() {
        // We spawn a separate task so we don't 'await' it here
        tauri::async_runtime::spawn(async move {
            if let Ok(clean_text) = clean_with_janitor(&content).await {
                let _ = fs::write(session_path.join("cleaned_note.md"), &clean_text);
                println!("Background AI Cleaning finished for {}", session_id);
            }
        });
    }

    // Return immediately so the UI can close/continue
    Ok(format!("Raw saved. AI cleaning in background: {}", session_id))
}
#[tauri::command]
async fn get_ai_preview(content: String) -> Result<String, String> {
    if content.trim().is_empty() {
        return Ok("No content to preview.".to_string());
    }
    // Call your existing janitor function directly
    let cleaned = clean_with_janitor(&content).await?;
    Ok(cleaned)
}
#[tauri::command]
fn final_close_ready(window: Window) {
    window.destroy().unwrap();
}

// REMOVED: wipe_session (It was causing the accidental deletions)

#[tauri::command]
fn load_note(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState { current_session_id: Mutex::new(String::new()) })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![process_note, final_close_ready, get_recent_notes, load_note, get_ai_preview])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let win = window.clone();
                
                window.dialog()
                    .message("Keep this session? (AI will clean and save)")
                    .buttons(MessageDialogButtons::OkCancel)
                    .show(move |result| {
                        if result {
                            // Only emit if user wants to save
                            win.emit("request-final-save", ()).unwrap(); 
                        } else {
                            // If they discard, we just close. No wiping, no deleting.
                            win.destroy().unwrap();
                        }
                    });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}