# Notepad-AI 📝

A lightweight, macOS-native notepad built with **Tauri**, **React**, and **Rust**.

## 🚀 Overview
Notepad-AI is designed for distraction-free writing with a backend "Janitor" service that manages file organization and storage.

## ✨ Current Features
- **Rust Backend:** Handles file I/O for high performance.
- **Native macOS Feel:** Integrated title bar and system decorations.
- **Adaptive Transparency:** Manual toggle between HUD (70% opacity) and Focus (95% opacity) modes. [NEW]

## 🛠️ Setup & Development
1. **Install dependencies:** `npm install`
2. **Run in development:** `npm run tauri dev`
3. **Build for macOS:** `npm run tauri build`

## 📅 Roadmap
- [x] Translucent "HUD" mode (70% opacity with backdrop blur).
- [ ] Debounced Auto-save (The "Smart Janitor").
- [ ] Always-on-top toggle for video transcription.
