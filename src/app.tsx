import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("Ready");

  const saveNote = async () => {
    setStatus("Saving...");
    try {
      // Make sure this folder exists on your Mac!
      const testPath = "/Users/muthana/Documents/Projects/notepad-ai/notes_test";
      
      const response = await invoke("process_note", { 
        content: note, 
        basePath: testPath 
      });
      
      setStatus(response as string);
      setTimeout(() => setStatus("Ready"), 3000);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err}`);
    }
  };

  return (
    <div className="app-container" style={{ 
      backgroundColor: "#1e1e1e", 
      color: "#efefef", 
      height: "100vh", 
      width: "100vw",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    }}>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Start writing..."
        style={{
          flex: 1,
          background: "transparent",
          color: "white",
          border: "none",
          padding: "30px",
          fontSize: "18px",
          lineHeight: "1.6",
          outline: "none",
          resize: "none",
          caretColor: "#007acc"
        }}
      />

      <div style={{ 
        padding: "10px 20px", 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        background: "#1a1a1a", 
        borderTop: "1px solid #333"
      }}>
        <span style={{ fontSize: "11px", color: "#666" }}>{status}</span>
        <button 
          onClick={saveNote}
          style={{
            padding: "6px 12px",
            background: "#333",
            color: "#ccc",
            border: "1px solid #444",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px"
          }}
        >
          Save Note
        </button>
      </div>
    </div>
  );
}

export default App;
