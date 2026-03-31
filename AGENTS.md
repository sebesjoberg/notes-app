# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React + TypeScript UI. Keep top-level app wiring in `src/App.tsx`, reusable editors in `src/components/`, and config parsing in `src/config/`. Static assets for Vite live in `public/` and `src/assets/`. The Tauri backend lives in `src-tauri/`; Rust commands and note parsing are in `src-tauri/src/`, and generated app icons/config are under `src-tauri/icons/` and `src-tauri/tauri.conf.json`. Treat `plan/` as working notes, not production code.

## Build, Test, and Development Commands
Use `npm run dev` for the web UI only. Use `npm run tauri dev` to run the desktop app with the Rust backend. Build the frontend bundle with `npm run build`. Run `npm run check` for Biome linting and formatting checks, and `npm run fix` to apply Biome fixes in `src/`. Run backend tests with `cargo test --manifest-path src-tauri/Cargo.toml`.

## Coding Style & Naming Conventions
Biome is the source of truth for frontend formatting: tabs for indentation and double quotes in TS/TSX. Prefer PascalCase for React component files (`MarkdownBlockEditor.tsx`), kebab-case for utility modules (`note-api.ts`), and camelCase for variables/functions. Keep JSON config keys explicit and validated, following the pattern in `src/config/slashCommands.ts`. In Rust, follow standard conventions: snake_case for functions/modules and `CamelCase` for types.

## CSS Module Guidelines
CSS modules (`.module.css`) must contain **structure only**: layout, spacing, sizing, positioning, typography metrics, and z-index. Never put colors, backgrounds, borders with color values, shadows, or other visual-theme properties in CSS modules. Theme-dependent colors belong in one of these places:
- **Mantine component props** (`c="dimmed"`, `bg="..."`, `withBorder`, etc.) for Mantine-rendered elements.
- **`src/theme.ts`** (the Mantine theme and CSS variables resolver) for global token definitions.
- **`@mantine/tiptap`** styles (imported via `@mantine/tiptap/styles.css` in `main.tsx`) for Tiptap editor content theming. Markdown block editors use `RichTextEditor` from `@mantine/tiptap` which provides themed content styling out of the box.
The one exception is interactive pseudo-state backgrounds (`:hover`, `[data-selected]`) that reference Mantine CSS variables like `var(--mantine-color-default-hover)` — these may remain in CSS modules because pseudo-states cannot be expressed through component props.

## Testing Guidelines
Current automated tests live in Rust under `src-tauri/src/notes.rs`. Add focused unit tests near parsing, serialization, and filesystem logic when changing note persistence. There is no frontend test runner configured yet, so any UI-heavy change should be backed by manual verification in `npm run tauri dev` and documented in the PR.

## Commit & Pull Request Guidelines
Recent commits use short, lowercase summaries such as `small fix` and `switch to biome`. Keep subjects brief, imperative, and specific to one change. PRs should describe user-visible behavior, note any changes to note block serialization or app data handling, link the relevant issue or planning note, and include screenshots for editor UI changes.

## Security & Configuration Tips
Do not hardcode absolute file paths. Notes are resolved through Tauri app-local storage, and the current backend intentionally accepts only `default.md`. Preserve that guard unless the note-loading contract changes across both `src/` and `src-tauri/`.
