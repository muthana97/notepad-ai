use tauri::{Emitter, Window, WindowEvent, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use walkdir::WalkDir;
use tokio::task;

struct AppState {
    current_session_id: Mutex<String>,
    is_closing: AtomicBool,
    close_timeout_active: AtomicBool,
    is_dirty: AtomicBool, // Track unsaved changes
}

#[derive(Serialize)]
struct NotePreview {
    path: String,
    title: String,
    preview: String,
    modified: u64,
    has_cleaned: bool,
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
    let system_msg = "You are a text clarity enhancer 1. Organize the text to enhance clarity using bullet points where necessary . 2. DO NOT add info. 3. DO NOT include greetings. Return ONLY formatted text.";

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
fn set_session_id(state: tauri::State<'_, AppState>, session_id: String) {
    let mut current_id = state.current_session_id.lock().unwrap();
    *current_id = session_id;
}

#[tauri::command]
fn set_dirty(state: tauri::State<'_, AppState>, dirty: bool) {
    state.is_dirty.store(dirty, Ordering::SeqCst);
}

#[tauri::command]
fn get_recent_notes(base_path: String) -> Result<Vec<NotePreview>, String> {
    let mut notes = Vec::new();
    let path = Path::new(&base_path);
    if !path.exists() { return Ok(vec![]); }

    for entry in WalkDir::new(path)
        .min_depth(1)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file()) 
    {
        let file_path = entry.path();
        let filename = file_path.file_name().and_then(|s| s.to_str()).unwrap_or("");

        if filename == "raw_note.txt" {
            let parent = file_path.parent().unwrap();
            let has_cleaned = parent.join("cleaned_note.md").exists();

            let content = fs::read_to_string(file_path).unwrap_or_default();
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            
            notes.push(NotePreview {
                path: file_path.to_str().unwrap().to_string(),
                title: parent.file_name().unwrap().to_str().unwrap().to_string(),
                preview: content.chars().take(100).collect(),
                modified: meta.modified().unwrap().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                has_cleaned,
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
    background_clean: Option<bool>,
    state: tauri::State<'_, AppState>
) -> Result<String, String> {
    {
        let mut current_id = state.current_session_id.lock().unwrap();
        *current_id = session_id.clone();
    } 

    let session_path = Path::new(&base_path).join(format!("TEMP_{}", session_id));
    if !session_path.exists() {
        fs::create_dir_all(&session_path).map_err(|e| e.to_string())?;
    }

    fs::write(session_path.join("raw_note.txt"), &content).map_err(|e| e.to_string())?;

    if !content.trim().is_empty() {
        let should_background = background_clean.unwrap_or(false);
        
        if should_background {
            let content_clone = content.clone();
            let path_clone = session_path.clone();
            
            task::spawn(async move {
                println!("Background cleaning starting...");
                if let Ok(clean_text) = clean_with_janitor(&content_clone).await {
                    let _ = fs::write(path_clone.join("cleaned_note.md"), &clean_text);
                    println!("Background cleaning complete");
                }
            });
        } else {
            if let Ok(clean_text) = clean_with_janitor(&content).await {
                fs::write(session_path.join("cleaned_note.md"), &clean_text)
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(format!("Saved: {}", session_id))
}

#[tauri::command]
async fn get_ai_preview(content: String) -> Result<String, String> {
    if content.trim().is_empty() {
        return Ok("No content to preview.".to_string());
    }
    let cleaned = clean_with_janitor(&content).await?;
    Ok(cleaned)
}

#[tauri::command]
fn final_close_ready(window: Window, state: tauri::State<'_, AppState>) {
    state.is_closing.store(false, Ordering::SeqCst);
    state.close_timeout_active.store(false, Ordering::SeqCst);
    window.destroy().unwrap();
}

#[tauri::command]
fn load_note(path: String) -> Result<String, String> {
    let path_obj = Path::new(&path);
    
    if !path_obj.exists() {
        return Err(format!("File not found: {}", path));
    }
    
    fs::read_to_string(&path).map_err(|e| format!("Read error for {}: {}", path, e))
}

fn show_save_dialog(window: &Window) {
    let win = window.clone();
    
    window.dialog()
        .message("Save note before closing?")
        .buttons(MessageDialogButtons::OkCancel)
        .show(move |save_result| {
            if save_result {
                let _ = win.emit("request-final-save", ());
            } else {
                let _ = win.destroy();
            }
        });
}

fn main() {
    tauri::Builder::default()
        .manage(AppState { 
            current_session_id: Mutex::new(String::new()),
            is_closing: AtomicBool::new(false),
            close_timeout_active: AtomicBool::new(false),
            is_dirty: AtomicBool::new(false),
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            process_note, 
            final_close_ready, 
            get_recent_notes, 
            load_note, 
            get_ai_preview,
            set_dirty,
	    set_session_id
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                
                // Only show dialog if NOT already closing AND state is DIRTY
                if state.is_closing.load(Ordering::SeqCst) || !state.is_dirty.load(Ordering::SeqCst) {
                    return;
                }
                
                api.prevent_close();

                let current_id = state.current_session_id.lock().unwrap().clone();

                if current_id.is_empty() {
                    window.destroy().unwrap();
                    return;
                }

                state.is_closing.store(true, Ordering::SeqCst);
                show_save_dialog(window);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}