import React, { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("Ready");
  const [isHud, setIsHud] = useState(false);

  // --- SESSION ID ---
  const [sessionId] = useState(() => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, "-").slice(0, 16);
  });

  const basePath =
    "/Users/muthana/Documents/Projects/notepad-ai/notes_test";

  // --- NORMAL SAVE (autosave + button) ---
  const saveNote = async () => {
    if (note.trim() === "") return;

    setStatus("Syncing...");
    try {
      const response = await invoke("process_note", {
        content: note,
        sessionId,
        basePath,
      });

      setStatus(response as string);
      setTimeout(() => setStatus("Ready"), 2000);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err}`);
    }
  };

  // --- FORCE SAVE (used ONLY on close) ---
  const forceSaveNote = async () => {
    if (note.trim() === "") return;

    await invoke("process_note", {
      content: note,
      sessionId,
      basePath,
    });
  };

  // --- AUTO SAVE (heartbeat) ---
  useEffect(() => {
    if (note.trim() === "") return;

    const timer = setTimeout(() => {
      saveNote().catch(console.error);
    }, 5000);

    return () => clearTimeout(timer);
  }, [note]);

  // --- FINAL SAVE ON WINDOW CLOSE ---
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen("request-final-save", async () => {
        console.log("Final save requested by Rust");

        try {
          await forceSaveNote();

          // ⏳ allow filesystem flush before shutdown
          await new Promise((r) => setTimeout(r, 200));
        } finally {
          await invoke("final_close_ready");
        }
      });
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [note]);

  return (
    <div
      style={{
        backgroundColor: isHud
          ? "rgba(30, 30, 30, 0.7)"
          : "rgba(20, 20, 20, 0.95)",
        backdropFilter: "blur(12px)",
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
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
        style={{
          padding: "10px 20px",
          display: "flex",
          justifyContent: "space-between",
          background: "rgba(0,0,0,0.3)",
        }}
      >
        <span style={{ fontSize: "11px", color: "#aaa" }}>
          {status} | {sessionId}
        </span>

        <button
          onClick={saveNote}
          style={{
            padding: "6px 12px",
            background: "#333",
            color: "#ccc",
            border: "1px solid #444",
            borderRadius: "4px",
          }}
        >
          Keep Note
        </button>
      </div>
    </div>
  );
}

export default App;
