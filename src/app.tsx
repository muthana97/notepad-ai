import React, { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import "./App.css";

function App() {
  const [originalContent, setOriginalContent] = useState("");
  const [view, setView] = useState<"home" | "editor">("home");
  const [note, setNote] = useState(""); // This is ALWAYS the Raw text
  const [previewContent, setPreviewContent] = useState(""); // This is the AI-cleaned display
  
  const sessionId = useRef(new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16)).current;
  const [currentFilename, setCurrentFilename] = useState(`TEMP_${sessionId}`); 
  
  const [status, setStatus] = useState("Ready");
  const [isHud, setIsHud] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [recentNotes, setRecentNotes] = useState<any[]>([]);

  const noteRef = useRef(note);
  useEffect(() => { noteRef.current = note; }, [note]);

  const basePath = "/Users/muthana/Documents/Projects/notepad-ai/notes_test";

  const refreshBulletin = useCallback(async () => {
    try {
      const notes: any[] = await invoke("get_recent_notes", { basePath }); 
      setRecentNotes(notes);
    } catch (err) { console.error("Bulletin Error:", err); }
  }, [basePath]);

  useEffect(() => { if (view === "home") refreshBulletin(); }, [view, refreshBulletin]);

  // THE DYNAMIC TOGGLE: Triggers AI cleanup without saving to disk
 const handleTogglePreview = async () => {
    if (!isPreview) {
      // 1. Check if anything actually changed
      if (note === originalContent && previewContent) {
        setStatus("Showing saved preview (No changes)");
        setIsPreview(true);
        return; // EXIT EARLY - Don't call Ollama
      }

      // 2. If it is different, call the Janitor
      setStatus("AI Janitor working...");
      try {
        const cleaned: string = await invoke("get_ai_preview", { content: note });
        setPreviewContent(cleaned);
        setIsPreview(true);
        setStatus("Preview Mode (Updated)");
      } catch (err) {
        setStatus("AI Offline - showing raw");
        setPreviewContent(note);
        setIsPreview(true);
      }
    } else {
      setIsPreview(false);
      setStatus("Ready");
    }
  };

  const performSave = useCallback(async (isFinal = false) => {
    const contentToSave = noteRef.current;
    if (contentToSave.trim() === "") {
        if (isFinal) await invoke("final_close_ready");
        return;
    }
    setStatus(isFinal ? "Final Mirroring..." : "Mirroring Note...");
    try {
      // This writes BOTH raw_note.txt and cleaned_note.md to disk
      await invoke("process_note", { content: contentToSave, sessionId, basePath });
      setStatus("Mirror Synced");
      if (!isFinal) setTimeout(() => setStatus("Ready"), 2000);
    } catch (err) { setStatus(`Error: ${err}`); }
  }, [sessionId, basePath]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setIsHud((prev) => !prev);
      }
      // Toggle Preview with Cmd/Ctrl + P
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handleTogglePreview();
      }
      if (e.key === "Escape" && view === "editor") setView("home");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, isPreview, note]); // Added dependencies for the toggle

const loadNote = async (path: string) => {
    try {
      const rawPath = path.endsWith("cleaned_note.md") 
        ? path.replace("cleaned_note.md", "raw_note.txt") 
        : path;
      const cleanedPath = rawPath.replace("raw_note.txt", "cleaned_note.md");

      const rawContent: string = await invoke("load_note", { path: rawPath });
      const cleanedContent: string = await invoke("load_note", { path: cleanedPath });

      setNote(rawContent);
      setOriginalContent(rawContent); // Store the "Source of Truth"
      setPreviewContent(cleanedContent); // Store the existing AI version
      
      const parts = rawPath.split('/');
      setCurrentFilename(parts[parts.length - 2] || "Note");
      setView("editor");
      setIsPreview(false); 
    } catch (err) { setStatus("Error loading source"); }
  };

  if (view === "home") {
    return (
      <div className="app-container" style={{ backgroundColor: "#121212", height: "100vh", width: "100vw", padding: "40px", overflowY: "auto", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <h2 style={{ color: "white", fontWeight: 300, marginBottom: "30px" }}>Recent Notes</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px", paddingBottom: "40px" }}>
          <div onClick={() => { setNote(""); setView("editor"); setIsPreview(false); }} style={{ height: "200px", border: "2px dashed #444", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#666", fontSize: "40px" }}> + </div>
          {recentNotes.map((n, i) => (
            <div key={i} onClick={() => loadNote(n.path)} style={{ height: "200px", background: "#1e1e1e", borderRadius: "12px", padding: "20px", cursor: "pointer", border: "1px solid #333", display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box" }}>
              <div style={{ color: "#4a90e2", fontWeight: "bold", fontSize: "11px", marginBottom: "8px" }}>{n.title.replace("TEMP_", "")}</div>
              <div style={{ color: "#d0d0d0", fontSize: "11px", lineHeight: "1.4", flex: 1, overflow: "hidden", maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)" }}>
                <ReactMarkdown>{n.preview}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${isHud ? "hud-mode" : ""}`} style={{ backgroundColor: isHud ? "rgba(30, 30, 30, 0.7)" : "#121212", height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", overflowY: "auto" }}>
        {isPreview ? (
          <div style={{ padding: "40px", color: "#e0e0e0", width: "100%", maxWidth: "800px", margin: "0 auto" }}>
            <ReactMarkdown>{previewContent}</ReactMarkdown>
          </div>
        ) : (
          <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, background: "transparent", color: "white", border: "none", padding: "30px", fontSize: "18px", outline: "none", resize: "none", fontFamily: "monospace" }} placeholder="Start typing..." />
        )}
      </div>
      <div style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", alignItems: "center" }}>
        <div style={{ fontSize: "11px", color: "#aaa" }}>
            <span style={{ color: "#4a90e2", fontWeight: "bold" }}>{currentFilename}</span> | {status}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setView("home")} style={{ padding: "6px 12px", background: "#333", color: "#ccc", borderRadius: "4px", border: "1px solid #444", cursor: "pointer" }}>🏠 Home</button>
          <button onClick={handleTogglePreview} style={{ padding: "6px 12px", background: isPreview ? "#6229ad" : "#333", color: "#ccc", borderRadius: "4px", border: "1px solid #444", cursor: "pointer" }}>{isPreview ? "✍️ Edit Raw" : "📖 AI Preview"}</button>
          <button onClick={() => performSave(false)} style={{ padding: "6px 12px", background: "#4a90e2", color: "white", borderRadius: "4px", border: "none", cursor: "pointer" }}>Keep Note</button>
        </div>
      </div>
    </div>
  );
}

export default App;