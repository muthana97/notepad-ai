import React, { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import "./App.css";

function App() {
  const [originalContent, setOriginalContent] = useState("");
  const [view, setView] = useState<"home" | "editor">("home");
  const [note, setNote] = useState("");

  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedContent, setEnhancedContent] = useState("");

  const [sessionId, setSessionId] = useState(() => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 18));
  const [currentFilename, setCurrentFilename] = useState(`TEMP_${sessionId}`);

  const [status, setStatus] = useState("Ready");
  const [isHud, setIsHud] = useState(false);
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const [isClosing, setIsClosing] = useState(false);

  const noteRef = useRef(note);
  const isCleaning = useRef(false);

  const basePath = "/Users/muthana/Documents/Projects/notepad-ai/notes_test";

  const isDirty = note !== originalContent;

  // Sync dirty state to Rust whenever it changes
  useEffect(() => {
    invoke("set_dirty", { dirty: isDirty }).catch(console.error);
  }, [isDirty]);
  useEffect(() => {
  invoke("set_session_id", { sessionId }).catch(console.error);
}, [sessionId]);

  const refreshBulletin = useCallback(async () => {
    try {
      const notes: any[] = await invoke("get_recent_notes", { basePath });
      setRecentNotes(notes);
    } catch (err) { console.error("Bulletin Error:", err); }
  }, [basePath]);

  useEffect(() => { if (view === "home") refreshBulletin(); }, [view, refreshBulletin]);

  const confirmNavigation = async (): Promise<boolean> => {
    if (!isDirty) return true;

    const confirmed = await confirm(
      "You have unsaved changes. Discard them and go home?",
      { title: "Unsaved Changes", type: "warning" }
    );
    return confirmed;
  };

  const handleGoHome = async () => {
    if (await confirmNavigation()) {
      setNote("");
      noteRef.current = "";
      setOriginalContent("");
      setEnhancedContent("");
      setView("home");
    }
  };

  const handleEnhance = useCallback(async () => {
    if (isEnhancing) {
      setIsEnhancing(false);
      setStatus("Ready");
      return;
    }

    if (isCleaning.current) {
      setStatus("AI already working...");
      return;
    }

    isCleaning.current = true;
    setStatus("AI Enhancing...");

    try {
      const cleaned: string = await invoke("get_ai_preview", { content: note });

      setEnhancedContent(cleaned);
      setIsEnhancing(true);
      setStatus("Review changes");
    } catch (err) {
      setStatus("AI Failed");
    } finally {
      isCleaning.current = false;
    }
  }, [isEnhancing, note]);

  const applyEnhancement = () => {
    setNote(enhancedContent);
    noteRef.current = enhancedContent;
    setIsEnhancing(false);
    setStatus("Enhancement applied");
  };

  const discardEnhancement = () => {
    setIsEnhancing(false);
    setStatus("Enhancement discarded");
  };

  const performSave = useCallback(async (options: {
    isFinal?: boolean;
    backgroundClean?: boolean
  } = {}) => {
    const { isFinal = false, backgroundClean = false } = options;
    const contentToSave = noteRef.current;

    if (contentToSave.trim() === "") {
      if (isFinal) await invoke("final_close_ready");
      return;
    }

    setStatus(backgroundClean ? "Saving (AI in background)..." : "Saving...");

    try {
      await invoke("process_note", {
        content: contentToSave,
        sessionId,
        basePath,
        backgroundClean
      });

      setOriginalContent(contentToSave);

      if (isFinal) {
        await invoke("final_close_ready");
        return;
      }

      setStatus(backgroundClean ? "Saved (Cleaning...)" : "Saved");
      setTimeout(() => setStatus("Ready"), 2000);
    } catch (err) {
      setStatus(`Error: ${err}`);
    }
  }, [sessionId, basePath]);

  useEffect(() => {
    const unlistenSave = listen("request-final-save", async () => {
      if (isClosing) return;
      setIsClosing(true);
      await performSave({ isFinal: true, backgroundClean: false });
    });

    return () => {
      unlistenSave.then(f => f());
    };
  }, [performSave, isClosing]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setIsHud((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handleEnhance();
      }
      if (e.key === "Escape" && view === "editor") {
        e.preventDefault();
        handleGoHome();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, handleEnhance, handleGoHome]);

  const loadNote = async (path: string) => {
    try {
      const folderPath = path.endsWith("cleaned_note.md") || path.endsWith("raw_note.txt")
        ? path.substring(0, path.lastIndexOf('/'))
        : path;

      const rawPath = `${folderPath}/raw_note.txt`;

      const rawContent: string = await invoke("load_note", { path: rawPath });

      setNote(rawContent);
      noteRef.current = rawContent;
      setOriginalContent(rawContent);

      const parts = folderPath.split('/');
      const folderName = parts[parts.length - 1] || "Note";
      
      const id = folderName.replace("TEMP_", "");
      setSessionId(id);
      setCurrentFilename(folderName);
      
      setView("editor");
      setStatus("Loaded");
    } catch (err) {
      console.error("Load error:", err);
      setStatus(`Error: ${err}`);
    }
  };

  const handleNewNote = async () => {
    if (await confirmNavigation()) {
      const newId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 18);
      setSessionId(newId);
      setCurrentFilename(`TEMP_${newId}`);
      
      setNote("");
      noteRef.current = "";
      setOriginalContent("");
      setEnhancedContent("");
      setView("editor");
      setStatus("New Note");
    }
  };

  if (isClosing) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>💾 Saving...</div>
          <div style={{ fontSize: '14px', color: '#888' }}>{status}</div>
        </div>
      </div>
    );
  }

  if (view === "home") {
    return (
      <div className="app-container" style={{ backgroundColor: "#121212", height: "100vh", width: "100vw", padding: "40px", overflowY: "auto", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <h2 style={{ color: "white", fontWeight: 300, marginBottom: "30px" }}>Recent Notes</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px", paddingBottom: "40px" }}>
          <div onClick={handleNewNote} style={{ height: "200px", border: "2px dashed #444", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#666", fontSize: "40px" }}> + </div>
          {recentNotes.map((n) => (
            <div key={n.path} onClick={() => loadNote(n.path)} style={{ height: "200px", background: "#1e1e1e", borderRadius: "12px", padding: "20px", cursor: "pointer", border: "1px solid #333", display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box" }}>
              <div style={{ color: "#4a90e2", fontWeight: "bold", fontSize: "11px", marginBottom: "8px", display: 'flex', justifyContent: 'space-between' }}>
                <span>{n.title.replace("TEMP_", "")}</span>
                {n.has_cleaned && <span style={{ color: '#4ade80' }}>✨</span>}
              </div>
              <div style={{ color: "#d0d0d0", fontSize: "11px", lineHeight: "1.4", flex: 1, overflow: "hidden" }}>
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
        
        {isEnhancing ? (
          <div style={{ display: "flex", width: "100%", height: "100%" }}>
            <textarea
              value={note}
              readOnly
              style={{
                flex: 1,
                background: "#1a1a1a",
                color: "#ccc",
                border: "none",
                padding: "20px",
                fontSize: "16px",
                fontFamily: "monospace"
              }}
            />
            <div style={{
              flex: 1,
              padding: "20px",
              background: "#121212",
              color: "#e0e0e0",
              overflowY: "auto"
            }}>
              <ReactMarkdown>{enhancedContent}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <textarea
            value={note}
            onChange={(e) => {
              const val = e.target.value;
              setNote(val);
              noteRef.current = val;
            }}
            style={{
              flex: 1,
              background: "transparent",
              color: "white",
              border: "none",
              padding: "30px",
              fontSize: "18px",
              outline: "none",
              resize: "none",
              fontFamily: "monospace"
            }}
            placeholder="Start typing..."
          />
        )}
      </div>

      <div style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", alignItems: "center" }}>
        <div style={{ fontSize: "11px", color: "#aaa" }}>
          <span style={{ color: "#4a90e2", fontWeight: "bold" }}>{currentFilename}</span> | {status}
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleGoHome}>🏠 Home</button>

          <button onClick={handleEnhance}>
            {isEnhancing ? "✍️ Edit Raw" : "✨ AI Enhance"}
          </button>

          {isEnhancing && (
            <>
              <button onClick={applyEnhancement}>✅ Apply</button>
              <button onClick={discardEnhancement}>❌ Discard</button>
            </>
          )}

          <button onClick={() => performSave()}>💾 Save</button>
        </div>
      </div>
    </div>
  );
}

export default App;