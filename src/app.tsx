import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("Ready");
  const [isHud, setIsHud] = useState(false);

  // Re-adding the missing logic that caused the "Invisible Window"
  const saveNote = async () => {
    setStatus("Saving...");
    try {
      // Ensure this path matches your Mac exactly
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
    <div style={{ 
      // Toggle between 70% and 95% opacity
      backgroundColor: isHud ? "rgba(30, 30, 30, 0.7)" : "rgba(20, 20, 20, 0.95)", 
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      height: "100vh",
      width: "100vw",
      display: "flex",
      flexDirection: "column",
      transition: "background-color 0.3s ease",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
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
        background: "rgba(0, 0, 0, 0.3)", 
        borderTop: "1px solid rgba(255, 255, 255, 0.1)"
      }}>
        <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
          <span style={{ fontSize: "11px", color: "#aaa" }}>{status}</span>
          
          <button 
            onClick={() => setIsHud(!isHud)}
            style={{
              padding: "4px 8px",
              background: isHud ? "#007acc" : "rgba(255,255,255,0.1)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "10px",
              fontWeight: "bold"
            }}
          >
            {isHud ? "HUD: ON" : "HUD: OFF"}
          </button>
        </div>

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
