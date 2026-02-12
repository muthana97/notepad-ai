use tauri::{Emitter, Window, WindowEvent, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use std::fs;
use std::path::Path;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

struct AppState {
    current_session_id: Mutex<String>,
}

// 1. STICKING TO THE STRUCT APPROACH (Warning-free)
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
    
    let system_msg = "You are a text formatter. 
    1. Organize the input text using Markdown (bullets, headers, bolding).
    2. DO NOT add new information.
    3. DO NOT infer meaning. 
    4. DO NOT include greetings or meta-talk like 'Here is your note'.
    5. If the input is a mess, just fix the grammar and structure. 
    6. Return ONLY the formatted text.";

    // Using the Struct we defined above
    let body = OllamaRequest {
        model: "llama3.2:3b".to_string(),
        prompt: content.to_string(),
        stream: false,
        system: system_msg.to_string(),
        options: serde_json::json!({
            "temperature": 0.1,
            "num_predict": 1000
        }),
    };

    let res = client
        .post("http://localhost:11434/api/generate")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network Error: {}", e))?;

    let json: OllamaResponse = res.json().await.map_err(|e| format!("JSON Error: {}", e))?;
    Ok(json.response.trim().to_string())
}

fn save_session_data(content: &str, session_id: &str, base_path: &str) -> Result<(), String> {
    let session_path = Path::new(base_path).join(format!("TEMP_{}", session_id));
    if !session_path.exists() {
        fs::create_dir_all(&session_path).map_err(|e| e.to_string())?;
    }
    fs::write(session_path.join("raw_note.txt"), content).map_err(|e| e.to_string())?;

    let re = Regex::new(r"(?m)^\s*>>(.*)").unwrap();
    let mut last_idx = 0;
    let mut last_title: Option<String> = None;

    for cap in re.captures_iter(content) {
        let full_match = cap.get(0).unwrap();
        let title = cap.get(1).unwrap().as_str().trim().replace("/", "-");
        if let Some(name) = last_title {
            let section = &content[last_idx..full_match.start()];
            let _ = fs::write(session_path.join(format!("{}.txt", name)), section.trim());
        }
        last_idx = full_match.end();
        last_title = Some(title);
    }

    if let Some(name) = last_title {
        let section = &content[last_idx..];
        let _ = fs::write(session_path.join(format!("{}.txt", name)), section.trim());
    }
    Ok(())
}

#[tauri::command]
async fn process_note(
    content: String, 
    session_id: String, 
    base_path: String, 
    run_janitor: bool,
    state: tauri::State<'_, AppState>
) -> Result<String, String> {
    {
        let mut current_id = state.current_session_id.lock().unwrap();
        *current_id = session_id.clone();
    } 

    save_session_data(&content, &session_id, &base_path)?;

    if run_janitor {
        if let Ok(clean_text) = clean_with_janitor(&content).await {
            let session_path = Path::new(&base_path).join(format!("TEMP_{}", session_id));
            let _ = fs::write(session_path.join("cleaned_note.md"), &clean_text);
            return Ok(format!("CLEANED:{}", clean_text));
        }
    }
    Ok(format!("Synced: {}", session_id))
}

// 2. THE HANDSHAKE LANDING SPOT
#[tauri::command]
fn final_close_ready(window: Window) {
    // window.destroy() is more forceful than .close(), perfect for finishing the task
    window.destroy().unwrap();
}

fn wipe_session(session_id: &str, base_path: &str) {
    let session_path = Path::new(base_path).join(format!("TEMP_{}", session_id));
    if session_path.exists() {
        let _ = fs::remove_dir_all(session_path);
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState { current_session_id: Mutex::new(String::new()) })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![process_note, final_close_ready])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let win = window.clone();
                let app_handle = window.app_handle().clone();

                window.dialog()
                    .message("Keep this session? (Canceling deletes temp files)")
                    .buttons(MessageDialogButtons::OkCancel)
                    .show(move |result| {
                        if result {
                            // Signals App.tsx to save and then call final_close_ready
                            win.emit("request-final-save", ()).unwrap();
                        } else {
                            let state = app_handle.state::<AppState>();
                            let session_id = state.current_session_id.lock().unwrap().clone();
                            let base_path = "/Users/muthana/Documents/Projects/notepad-ai/notes_test";
                            
                            if !session_id.is_empty() {
                                wipe_session(&session_id, base_path);
                            }
                            win.destroy().unwrap();
                        }
                    });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}