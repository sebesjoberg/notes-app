# Plan

1️⃣ ✍️ Core Editor (FOUNDATION)
Markdown-backed notes
TipTap editor with:
headings, lists, code
block IDs (hidden)
Save/load .md files

👉 Output: working note editor

2️⃣ 🧱 Block System (CORE DIFFERENTIATOR)
Parse Markdown → Block[]
Assign stable block IDs
Render blocks via React
Support:
paragraph
heading
code
draw (Excalidraw)
mermaid

👉 Output: true block-based system

3️⃣ 🔗 Linking system
[[note]] links
[[note#blockId]] support
Click to navigate
Export rule:
convert to relative links:
[Note](./note.md)

👉 Output: connected notes

4️⃣ 🔍 Search (block-level)
Index blocks (not notes)
Use MiniSearch
Show:
preview snippet
note title
Rank:
recent edits boost
exact match boost

👉 Output: fast, useful search

5️⃣ ⚡ Command system (KEY UX)
Global command palette:
Cmd/Ctrl + K
Inline commands:
/draw
/mermaid
/link
“Ctrl + T” terminal-style commands:
executes command
prints output in grey block

Example:

> generate summary
[output shown below]

👉 Output: power-user UX

6️⃣ 💻 Integrated terminal (V1-lite)
xterm.js UI
Tauri spawns shell
Basic features:
run commands
Git works
toggle panel

👉 No need for tabs/splits yet

7️⃣ 📤 Export system (simple but powerful)
Built-in:
Export to:
.md
.txt
.pdf (basic HTML → PDF)
Structure:
convert blocks → Markdown → output

👉 Keep it simple

8️⃣ 🔌 Plugin system (MINIMAL V1)

Don’t overbuild—just:

onCommand()
onExport()
Example:
Confluence plugin:
takes Markdown
uploads via API

👉 This unlocks your idea without complexity

9️⃣ 🎨 Modes (simple version)

Just 2 modes:

✍️ Edit mode
👁️ Preview mode (block rendering)

👉 Don’t overdo modes yet

🔟 🧭 Navigation (important feel)
Click links → open note
Cursor stack (like VS Code):
go back / forward
Recently opened notes

👉 Makes app feel “fast”

## Tech Stack

Backend: Tauri
Frontend: React + Vite
Editor: TipTap
UI: Mantine
Search: MiniSearch
Drawing: Excalidraw
Diagrams: Mermaid
Terminal: xterm.js
