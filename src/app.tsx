import React, { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import "./App.css";

function App() {
  const [note, setNote] = useState("");
  const [rawBackup, setRawBackup] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isHud, setIsHud] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  // Source of truth for the note, ensuring the closing logic always has latest text
  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionId = useRef(new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16)).current;
  const basePath = "/Users/muthana/Documents/Projects/notepad-ai/notes_test";

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command + T toggles HUD Mode
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setIsHud((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const performSave = useCallback(async (isFinal = false) => {
    const contentToSave = noteRef.current;
    if (contentToSave.trim() === "") return;

    setStatus(isFinal ? "Janitor cleaning..." : "Syncing...");

    try {
      const result: string = await invoke("process_note", {
        content: contentToSave,
        sessionId,
        basePath,
        runJanitor: isFinal,
      });

      if (isFinal && result.startsWith("CLEANED:")) {
        const cleanedText = result.replace("CLEANED:", "").trim();

        // Safety Guard: Reject if the Janitor starts a conversation
        const badStarts = ["here is", "sure", "i have", "certainly"];
        if (badStarts.some(word => cleanedText.toLowerCase().startsWith(word))) {
          setStatus("Janitor Error: AI tried to talk. Reverting.");
          return;
        }

        setRawBackup(contentToSave);
        setNote(cleanedText);
        setStatus("Deep Cleaned (Undo Available)");
      } else {
        setStatus("Synced");
        setTimeout(() => setStatus("Ready"), 2000);
      }
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err}`);
    }
  }, [sessionId]);

  // --- CLOSING HANDSHAKE (The "Keep" Fix) ---
  useEffect(() => {
    let unlistenFn: () => void;
    const setup = async () => {
      unlistenFn = await listen("request-final-save", async () => {
        setStatus("Finalizing Vault...");
        // 1. Save current state without Janitor to be fast
        await performSave(false);
        // 2. Short delay to ensure file system write completes
        await new Promise((r) => setTimeout(r, 200));
        // 3. Signal Rust that we are ready to terminate
        await invoke("final_close_ready");
      });
    };
    setup();
    return () => { if (unlistenFn) unlistenFn(); };
  }, [performSave]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(e.target.value);
    if (rawBackup !== null) setRawBackup(null);
  };

  const handleUndo = () => {
    if (rawBackup !== null) {
      setNote(rawBackup);
      setRawBackup(null);
      setStatus("Restored Original");
    }
  };

  // Heartbeat Auto-save every 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (status === "Ready" || status === "Synced") performSave();
    }, 5000);
    return () => clearTimeout(timer);
  }, [note, performSave, status]);

  return (
    <div className={`app-container ${isHud ? "hud-mode" : ""}`} style={{ 
      backgroundColor: isHud ? "rgba(30, 30, 30, 0.7)" : "rgba(20, 20, 20, 0.95)", 
      height: "100vh", width: "100vw", display: "flex", flexDirection: "column", transition: "all 0.2s ease" 
    }}>
      
      <div style={{ flex: 1, overflowY: "auto", display: "flex" }}>
        {isPreview ? (
          <div className="markdown-body" style={{ width: "100%", padding: "40px", color: "#e0e0e0", textAlign: "left" }}>
            <ReactMarkdown>{note}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={note}
            onChange={handleTextChange}
            placeholder="Start typing...(hint: Use ✨ Clean button to AI structure your note)"
            style={{ 
                flex: 1, background: "transparent", color: "white", border: "none", 
                padding: "30px", fontSize: "18px", outline: "none", resize: "none" 
            }}
          />
        )}
      </div>

      <div className="bottom-toolbar" style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: "11px", color: "#aaa" }}> 
          {status} <span style={{ color: "#444" }}>|</span> {sessionId} 
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button 
            onClick={() => setIsPreview(!isPreview)} 
            style={{ 
                padding: "6px 12px", background: isPreview ? "#6229ad" : "#333", 
                color: "#ccc", border: "1px solid #444", borderRadius: "4px", fontSize: "11px", cursor: "pointer" 
            }}
          >
            {isPreview ? "✍️ Edit Raw" : "📖 Read View"}
          </button>

          {rawBackup ? (
            <button onClick={handleUndo} style={{ padding: "6px 12px", background: "#d9534f", color: "white", border: "none", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>
              ⏪ Undo
            </button>
          ) : (
            <button onClick={() => performSave(true)} style={{ padding: "6px 12px", background: "#4a90e2", color: "white", border: "none", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>
              ✨ Clean
            </button>
          )}

          <button onClick={() => setIsHud(!isHud)} style={{ padding: "6px 12px", background: "#333", color: "#ccc", border: "1px solid #444", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>
            {isHud ? "Solid View" : "HUD View"}
          </button>

          <button onClick={() => performSave(false)} style={{ padding: "6px 12px", background: "#333", color: "#ccc", border: "1px solid #444", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>
            Keep Note
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;