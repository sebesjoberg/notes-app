use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NoteDocument {
    pub note_name: String,
    pub path: String,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub note_name: String,
    pub path: String,
    pub saved_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Block {
    Markdown { id: String, markdown: String },
    Code {
        id: String,
        language: Option<String>,
        code: String,
    },
}

#[derive(Debug, Clone)]
struct FenceHeader {
    fence_char: char,
    fence_len: usize,
    block_type: String,
    attrs: HashMap<String, String>,
}

pub fn load_note_from_app<R: Runtime>(
    app: &impl Manager<R>,
    note_name: String,
) -> Result<NoteDocument, String> {
    let note_path = resolve_note_path(app, &note_name)?;
    load_note_from_path(&note_path, note_name)
}

pub fn save_note_from_app<R: Runtime>(
    app: &impl Manager<R>,
    note_name: String,
    blocks: Vec<Block>,
) -> Result<SaveResult, String> {
    let note_path = resolve_note_path(app, &note_name)?;
    save_note_to_path(&note_path, note_name, &blocks)
}

#[tauri::command]
pub fn load_note(app: AppHandle, note_name: String) -> Result<NoteDocument, String> {
    load_note_from_app(&app, note_name)
}

#[tauri::command]
pub fn save_note(
    app: AppHandle,
    note_name: String,
    blocks: Vec<Block>,
) -> Result<SaveResult, String> {
    save_note_from_app(&app, note_name, blocks)
}

fn load_note_from_path(note_path: &Path, note_name: String) -> Result<NoteDocument, String> {
    ensure_note_directory(note_path)?;

    let blocks = if note_path.exists() {
        let content = fs::read_to_string(note_path)
            .map_err(|error| format!("Failed to read {}: {error}", note_path.display()))?;
        parse_blocks(&content)?
    } else {
        default_blocks()
    };

    Ok(NoteDocument {
        note_name,
        path: note_path.display().to_string(),
        blocks,
    })
}

fn save_note_to_path(
    note_path: &Path,
    note_name: String,
    blocks: &[Block],
) -> Result<SaveResult, String> {
    ensure_note_directory(note_path)?;
    let content = serialize_blocks(blocks)?;

    fs::write(note_path, content)
        .map_err(|error| format!("Failed to write {}: {error}", note_path.display()))?;

    Ok(SaveResult {
        note_name,
        path: note_path.display().to_string(),
        saved_at_ms: now_ms()?,
    })
}

fn ensure_note_directory(note_path: &Path) -> Result<(), String> {
    let directory = note_path.parent().ok_or_else(|| {
        format!(
            "Could not resolve the parent directory for {}",
            note_path.display()
        )
    })?;

    fs::create_dir_all(directory)
        .map_err(|error| format!("Failed to create {}: {error}", directory.display()))
}

fn resolve_note_path<R: Runtime>(
    app: &impl Manager<R>,
    note_name: &str,
) -> Result<PathBuf, String> {
    validate_note_name(note_name)?;

    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;

    Ok(base_dir.join(note_name))
}

fn validate_note_name(note_name: &str) -> Result<(), String> {
    if note_name.contains('/') || note_name.contains('\\') || note_name.contains("..") {
        return Err(format!("Invalid note name: {note_name}"));
    }

    if note_name.trim().is_empty() {
        return Err("Note name must not be empty.".into());
    }

    if !note_name.ends_with(".md") {
        return Err(format!("Note name must end with .md: {note_name}"));
    }

    Ok(())
}

fn parse_blocks(input: &str) -> Result<Vec<Block>, String> {
    let normalized = input.replace("\r\n", "\n");

    if normalized.trim().is_empty() {
        return Ok(default_blocks());
    }

    let lines: Vec<&str> = normalized.lines().collect();
    let mut blocks = Vec::new();
    let mut index = 0;
    let mut saw_fenced_blocks = false;

    while index < lines.len() {
        let line = lines[index];

        if line.trim().is_empty() {
            index += 1;
            continue;
        }

        if let Some(header) = parse_fence_header(line) {
            saw_fenced_blocks = true;
            index += 1;

            let mut body_lines = Vec::new();
            let mut closed = false;

            while index < lines.len() {
                let current = lines[index];

                if is_closing_fence(current, header.fence_char, header.fence_len) {
                    closed = true;
                    index += 1;
                    break;
                }

                body_lines.push(current);
                index += 1;
            }

            if !closed {
                return Err(format!(
                    "Unclosed block fence for {} block.",
                    header.block_type
                ));
            }

            blocks.push(block_from_header(header, body_lines.join("\n"), blocks.len() + 1)?);
            continue;
        }

        if saw_fenced_blocks {
            return Err(format!(
                "Unexpected content outside block fences: {}",
                line.trim()
            ));
        }

        return Ok(vec![Block::Markdown {
            id: generated_block_id(1),
            markdown: normalized,
        }]);
    }

    if blocks.is_empty() {
        Ok(default_blocks())
    } else {
        Ok(blocks)
    }
}

fn block_from_header(
    header: FenceHeader,
    body: String,
    position: usize,
) -> Result<Block, String> {
    let id = header
        .attrs
        .get("id")
        .cloned()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| generated_block_id(position));

    if !is_valid_attr_token(&id) {
        return Err(format!("Invalid block id: {id}"));
    }

    match header.block_type.as_str() {
        "markdown" => Ok(Block::Markdown { id, markdown: body }),
        "code" => Ok(Block::Code {
            id,
            language: header
                .attrs
                .get("lang")
                .cloned()
                .or_else(|| header.attrs.get("language").cloned()),
            code: body,
        }),
        other => Err(format!("Unsupported block type: {other}")),
    }
}

fn parse_fence_header(line: &str) -> Option<FenceHeader> {
    let trimmed = line.trim_end();
    let mut chars = trimmed.chars();
    let fence_char = chars.next()?;

    if fence_char != '`' && fence_char != '~' {
        return None;
    }

    let fence_len = trimmed.chars().take_while(|char| *char == fence_char).count();

    if fence_len < 3 {
        return None;
    }

    let rest = &trimmed[fence_len..];
    let block_prefix = rest.strip_prefix("block:")?;
    let mut parts = block_prefix.split_whitespace();
    let block_type = parts.next()?.to_string();
    let mut attrs = HashMap::new();

    for attr in parts {
        let (key, value) = attr.split_once('=')?;
        attrs.insert(key.to_string(), value.to_string());
    }

    Some(FenceHeader {
        fence_char,
        fence_len,
        block_type,
        attrs,
    })
}

fn is_closing_fence(line: &str, fence_char: char, fence_len: usize) -> bool {
    let trimmed = line.trim();

    if trimmed.is_empty() {
        return false;
    }

    let count = trimmed.chars().take_while(|char| *char == fence_char).count();

    count >= fence_len && trimmed[count..].trim().is_empty()
}

fn serialize_blocks(blocks: &[Block]) -> Result<String, String> {
    blocks
        .iter()
        .map(serialize_block)
        .collect::<Result<Vec<_>, _>>()
        .map(|chunks| chunks.join("\n\n"))
}

fn serialize_block(block: &Block) -> Result<String, String> {
    match block {
        Block::Markdown { id, markdown } => serialize_fenced_block("markdown", id, None, markdown),
        Block::Code { id, language, code } => {
            serialize_fenced_block("code", id, language.as_deref(), code)
        }
    }
}

fn serialize_fenced_block(
    block_type: &str,
    id: &str,
    language: Option<&str>,
    body: &str,
) -> Result<String, String> {
    if !is_valid_attr_token(id) {
        return Err(format!("Invalid block id: {id}"));
    }

    let mut header = format!("block:{block_type} id={id}");

    if let Some(language) = language.filter(|value| !value.trim().is_empty()) {
        if !is_valid_attr_token(language) {
            return Err(format!("Invalid code language token: {language}"));
        }

        header.push_str(" lang=");
        header.push_str(language);
    }

    let fence_len = longest_backtick_run(body).max(3) + 1;
    let fence = "`".repeat(fence_len);

    if body.is_empty() {
        Ok(format!("{fence}{header}\n{fence}"))
    } else {
        Ok(format!("{fence}{header}\n{body}\n{fence}"))
    }
}

fn is_valid_attr_token(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|char| !char.is_whitespace() && char != '`' && char != '~')
}

fn longest_backtick_run(content: &str) -> usize {
    let mut longest = 0;
    let mut current = 0;

    for char in content.chars() {
        if char == '`' {
            current += 1;
            longest = longest.max(current);
        } else {
            current = 0;
        }
    }

    longest
}

fn generated_block_id(position: usize) -> String {
    format!("block-{position}")
}

fn default_blocks() -> Vec<Block> {
    vec![Block::Markdown {
        id: generated_block_id(1),
        markdown: String::new(),
    }]
}

fn now_ms() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to read system time: {error}"))?;

    u64::try_from(duration.as_millis()).map_err(|_| "System time exceeded u64 range.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn empty_content_loads_default_block() {
        let blocks = parse_blocks("").expect("empty content should parse");

        assert_eq!(blocks, default_blocks());
    }

    #[test]
    fn plain_markdown_loads_as_single_markdown_block() {
        let blocks = parse_blocks("# Title\n\n- item").expect("plain markdown should parse");

        assert_eq!(
            blocks,
            vec![Block::Markdown {
                id: "block-1".into(),
                markdown: "# Title\n\n- item".into(),
            }]
        );
    }

    #[test]
    fn fenced_blocks_parse_into_block_list() {
        let input = "```block:markdown id=intro\n# Title\n```\n\n```block:code id=snippet lang=ts\nconsole.log('hi');\n```";
        let blocks = parse_blocks(input).expect("fenced blocks should parse");

        assert_eq!(
            blocks,
            vec![
                Block::Markdown {
                    id: "intro".into(),
                    markdown: "# Title".into(),
                },
                Block::Code {
                    id: "snippet".into(),
                    language: Some("ts".into()),
                    code: "console.log('hi');".into(),
                },
            ]
        );
    }

    #[test]
    fn serializer_round_trips_backticks_in_code() {
        let blocks = vec![
            Block::Markdown {
                id: "intro".into(),
                markdown: "## Title".into(),
            },
            Block::Code {
                id: "code-1".into(),
                language: Some("ts".into()),
                code: "const fence = \"```\";\nconsole.log(fence);\n".into(),
            },
        ];

        let serialized = serialize_blocks(&blocks).expect("blocks should serialize");
        let parsed = parse_blocks(&serialized).expect("serialized content should parse");

        assert_eq!(parsed, blocks);
    }

    #[test]
    fn serializer_is_stable_after_round_trip() {
        let blocks = vec![
            Block::Markdown {
                id: "intro".into(),
                markdown: "# Title\n\n1. one\n2. two".into(),
            },
            Block::Code {
                id: "demo".into(),
                language: Some("tsx".into()),
                code: "export const Demo = () => <div />;".into(),
            },
        ];

        let serialized = serialize_blocks(&blocks).expect("first serialization should succeed");
        let reparsed = parse_blocks(&serialized).expect("serialized content should parse");
        let reserialized =
            serialize_blocks(&reparsed).expect("second serialization should succeed");

        assert_eq!(reserialized, serialized);
    }

    #[test]
    fn save_and_load_round_trip_through_filesystem() {
        let test_root = unique_test_dir();
        let note_path = test_root.join("default.md");
        let blocks = vec![
            Block::Markdown {
                id: "block-1".into(),
                markdown: "# Note".into(),
            },
            Block::Code {
                id: "block-2".into(),
                language: Some("rust".into()),
                code: "fn main() {}".into(),
            },
        ];

        save_note_to_path(&note_path, "default.md".into(), &blocks)
            .expect("save should succeed");
        let loaded =
            load_note_from_path(&note_path, "default.md".into()).expect("load should succeed");

        assert_eq!(loaded.blocks, blocks);

        fs::remove_dir_all(&test_root).expect("temporary directory should be removable");
    }

    #[test]
    fn missing_file_loads_default_block() {
        let test_root = unique_test_dir();
        let note_path = test_root.join("alternative.md");

        let loaded = load_note_from_path(&note_path, "alternative.md".into())
            .expect("missing file should still load");

        assert_eq!(loaded.blocks, default_blocks());

        fs::remove_dir_all(&test_root).expect("temporary directory should be removable");
    }

    #[test]
    fn validate_note_name_accepts_generic_markdown_files() {
        assert!(validate_note_name("default.md").is_ok());
        assert!(validate_note_name("alternative.md").is_ok());
    }

    #[test]
    fn validate_note_name_rejects_invalid_names() {
        assert!(validate_note_name("../secret.md").is_err());
        assert!(validate_note_name("nested/default.md").is_err());
        assert!(validate_note_name("note.txt").is_err());
        assert!(validate_note_name("").is_err());
    }

    fn unique_test_dir() -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "notes-app-tests-{}-{}",
            std::process::id(),
            timestamp
        ));

        fs::create_dir_all(&directory).expect("temporary directory should be created");
        directory
    }
}
