import { invoke } from "@tauri-apps/api/core";

export type MarkdownBlock = {
	id: string;
	type: "markdown";
	markdown: string;
};

export type CodeBlock = {
	id: string;
	type: "code";
	language: string | null;
	code: string;
};

export type Block = MarkdownBlock | CodeBlock;

export type NoteDocument = {
	noteName: string;
	path: string;
	blocks: Block[];
};

export type SaveResult = {
	noteName: string;
	path: string;
	savedAtMs: number;
};

export async function loadNote(noteName: string) {
	return invoke<NoteDocument>("load_note", { noteName });
}

export async function saveNote(noteName: string, blocks: Block[]) {
	return invoke<SaveResult>("save_note", { noteName, blocks });
}
