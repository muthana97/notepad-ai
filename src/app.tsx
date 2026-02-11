import React, { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("Ready");
  const [isHud, setIsHud] = useState(false);

  const [sessionId] = useState(() => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, "-").slice(0, 16);
  });

  const basePath = "/Users/muthana/Documents/Projects/notepad-ai/notes_test";

  // --- REUSABLE SAVE LOGIC ---
  const performSave = useCallback(async (isFinal = false) => {
    if (note.trim() === "") return;
    if (!isFinal) setStatus("Syncing...");
    
    try {
      await invoke("process_note", {
        content: note,
        sessionId,
        basePath,
      });
      if (!isFinal) {
        setStatus("Synced");
        setTimeout(() => setStatus("Ready"), 2000);
      }
    } catch (err) {
      console.error(err);
      setStatus("Error");
    }
  }, [note, sessionId]);

  // --- AUTO SAVE (Heartbeat) ---
  useEffect(() => {
    const timer = setTimeout(() => {
      performSave();
    }, 5000);
    return () => clearTimeout(timer);
  }, [note, performSave]);

  // --- FINAL SAVE HANDSHAKE (Route 1) ---
  useEffect(() => {
    let unlistenFn: any;

    const setup = async () => {
      unlistenFn = await listen("request-final-save", async () => {
        console.log("Final save requested by Rust");
        await performSave(true);
        // Ensure disk flush
        await new Promise((r) => setTimeout(r, 150));
        await invoke("final_close_ready");
      });
    };

    setup();
    return () => { if (unlistenFn) unlistenFn(); };
  }, [performSave]); 

  return (
    <div
      className={`app-container ${isHud ? "hud-mode" : ""}`}
      style={{
        backgroundColor: isHud ? "rgba(30, 30, 30, 0.7)" : "rgba(20, 20, 20, 0.95)",
        backdropFilter: "blur(12px)",
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        transition: "background-color 0.3s ease"
      }}
    >
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Start typing..."
        style={{
          flex: 1,
          background: "transparent",
          color: "white",
          border: "none",
          padding: "30px",
          fontSize: "18px",
          outline: "none",
          resize: "none",
        }}
      />

      <div
        className="bottom-toolbar"
        style={{
          padding: "10px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "11px", color: "#aaa" }}>
            {status} | {sessionId}
          </span>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          {/* RESTORED HUD TOGGLE */}
          <button
            onClick={() => setIsHud(!isHud)}
            style={{
              padding: "6px 12px",
              background: isHud ? "#555" : "#333",
              color: "#ccc",
              border: "1px solid #444",
              borderRadius: "4px",
              fontSize: "11px",
              cursor: "pointer"
            }}
          >
            {isHud ? "Solid View" : "HUD View"}
          </button>

          <button
            onClick={() => performSave()}
            style={{
              padding: "6px 12px",
              background: "#333",
              color: "#ccc",
              border: "1px solid #444",
              borderRadius: "4px",
              fontSize: "11px",
              cursor: "pointer"
            }}
          >
            Keep Note
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;