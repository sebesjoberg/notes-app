import {
	Alert,
	Badge,
	Box,
	Button,
	Code,
	Group,
	Kbd,
	Paper,
	Text,
	Title,
} from "@mantine/core";
import type { Editor as TiptapEditor } from "@tiptap/react";
import {
	startTransition,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import "./App.css";
import { CodeBlockEditor } from "./components/CodeBlockEditor";
import { MarkdownBlockEditor } from "./components/MarkdownBlockEditor";
import {
	type Block,
	type CodeBlock,
	loadNote,
	type MarkdownBlock,
	type NoteDocument,
	saveNote,
} from "./note-api";

const DEFAULT_NOTE_NAME = "default.md";
const AUTOSAVE_DELAY_MS = 750;
const MAX_APP_HISTORY = 200;

type SaveState = "idle" | "saving" | "saved" | "error";
type FocusRequest = {
	blockId: string;
	position: "start" | "end";
	target: "code" | "markdown";
	token: number;
};
type HistoryEntry = {
	activeBlockId: string | null;
	blocks: Block[];
};

function App() {
	const [document, setDocument] = useState<NoteDocument | null>(null);
	const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
	const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
	const activeMarkdownEditorRef = useRef<TiptapEditor | null>(null);
	const historyRef = useRef<{ future: HistoryEntry[]; past: HistoryEntry[] }>({
		future: [],
		past: [],
	});
	const focusTokenRef = useRef(0);
	const revisionRef = useRef(0);

	function buildFocusRequest(
		block: Block,
		position: FocusRequest["position"] = "end",
	): FocusRequest {
		focusTokenRef.current += 1;

		return {
			blockId: block.id,
			position,
			target: block.type === "code" ? "code" : "markdown",
			token: focusTokenRef.current,
		};
	}

	function clearFocusRequest() {
		setFocusRequest(null);
	}

	function clearHistory() {
		historyRef.current = { future: [], past: [] };
	}

	function pushDocumentHistorySnapshot(
		blocks = document?.blocks,
		historyActiveBlockId = activeBlockId,
	) {
		if (!blocks) {
			return;
		}

		const nextPast = [
			...historyRef.current.past,
			createHistoryEntry(blocks, historyActiveBlockId),
		].slice(-MAX_APP_HISTORY);

		historyRef.current = {
			future: [],
			past: nextPast,
		};
	}

	function applyDocumentBlocks(
		rawBlocks: Block[],
		requestedActiveBlockId: string | null,
		requestedFocus: FocusRequest | null,
	) {
		const normalized = normalizeBlocks(rawBlocks);
		const nextBlocks = normalized.blocks;
		const resolvedActiveBlockId =
			resolveNormalizedBlockId(normalized, requestedActiveBlockId) ??
			nextBlocks[0]?.id ??
			null;
		const resolvedFocus =
			resolveFocusRequest(normalized, requestedFocus) ??
			(resolvedActiveBlockId
				? buildFocusRequest(
						nextBlocks.find((block) => block.id === resolvedActiveBlockId) ??
							nextBlocks[0],
					)
				: null);

		activeMarkdownEditorRef.current = null;
		revisionRef.current += 1;
		setHasUnsavedChanges(true);
		setSaveState("idle");
		setErrorMessage(null);

		startTransition(() => {
			setDocument((currentDocument) =>
				currentDocument
					? {
							...currentDocument,
							blocks: nextBlocks,
						}
					: currentDocument,
			);
			setActiveBlockId(resolvedActiveBlockId);
			setFocusRequest(resolvedFocus);
		});
	}

	function restoreHistoryEntry(entry: HistoryEntry) {
		const restoredBlocks = cloneBlocks(entry.blocks);
		const normalized = normalizeBlocks(restoredBlocks);
		const restoredActiveBlockId =
			resolveNormalizedBlockId(normalized, entry.activeBlockId) ??
			normalized.blocks[0]?.id ??
			null;
		const restoredBlock =
			normalized.blocks.find((block) => block.id === restoredActiveBlockId) ??
			normalized.blocks[0] ??
			null;

		activeMarkdownEditorRef.current = null;
		revisionRef.current += 1;
		setHasUnsavedChanges(true);
		setSaveState("idle");
		setErrorMessage(null);

		startTransition(() => {
			setDocument((currentDocument) =>
				currentDocument
					? {
							...currentDocument,
							blocks: normalized.blocks,
						}
					: currentDocument,
			);
			setActiveBlockId(restoredActiveBlockId);
			setFocusRequest(
				restoredBlock ? buildFocusRequest(restoredBlock, "end") : null,
			);
		});
	}

	function undoDocumentHistory() {
		if (!document) {
			return false;
		}

		const previousEntry = historyRef.current.past.at(-1);

		if (!previousEntry) {
			return false;
		}

		historyRef.current = {
			future: [
				...historyRef.current.future,
				createHistoryEntry(document.blocks, activeBlockId),
			].slice(-MAX_APP_HISTORY),
			past: historyRef.current.past.slice(0, -1),
		};

		restoreHistoryEntry(previousEntry);
		return true;
	}

	function redoDocumentHistory() {
		if (!document) {
			return false;
		}

		const nextEntry = historyRef.current.future.at(-1);

		if (!nextEntry) {
			return false;
		}

		historyRef.current = {
			future: historyRef.current.future.slice(0, -1),
			past: [
				...historyRef.current.past,
				createHistoryEntry(document.blocks, activeBlockId),
			].slice(-MAX_APP_HISTORY),
		};

		restoreHistoryEntry(nextEntry);
		return true;
	}

	const loadDocument = useEffectEvent(async () => {
		setIsLoading(true);
		setErrorMessage(null);

		try {
			const loadedDocument = await loadNote(DEFAULT_NOTE_NAME);
			const normalized = normalizeBlocks(loadedDocument.blocks);
			const firstBlock = normalized.blocks[0] ?? null;

			activeMarkdownEditorRef.current = null;
			revisionRef.current = 0;
			clearHistory();

			startTransition(() => {
				setDocument({
					...loadedDocument,
					blocks: normalized.blocks,
				});
				setActiveBlockId(firstBlock?.id ?? null);
				setFocusRequest(
					firstBlock ? buildFocusRequest(firstBlock, "start") : null,
				);
				setHasUnsavedChanges(false);
				setSaveState("idle");
				setLastSavedAt(null);
			});
		} catch (error) {
			setErrorMessage(getErrorMessage(error));
			setSaveState("error");
		} finally {
			setIsLoading(false);
		}
	});

	const persistDocument = useEffectEvent(
		async (snapshot: NoteDocument, revision: number) => {
			setSaveState("saving");

			try {
				const result = await saveNote(snapshot.noteName, snapshot.blocks);

				startTransition(() => {
					setDocument((currentDocument) =>
						currentDocument
							? {
									...currentDocument,
									path: result.path,
								}
							: currentDocument,
					);
				});

				setLastSavedAt(result.savedAtMs);

				if (revision === revisionRef.current) {
					setHasUnsavedChanges(false);
					setSaveState("saved");
				} else {
					setHasUnsavedChanges(true);
					setSaveState("idle");
				}

				setErrorMessage(null);
			} catch (error) {
				setErrorMessage(getErrorMessage(error));
				setSaveState("error");
			}
		},
	);

	const saveCurrentDocument = useEffectEvent(async () => {
		if (!document || saveState === "saving") {
			return;
		}

		await persistDocument(document, revisionRef.current);
	});

	useEffect(() => {
		void loadDocument();
	}, []);

	useEffect(() => {
		if (
			!document ||
			!hasUnsavedChanges ||
			isLoading ||
			saveState === "saving"
		) {
			return;
		}

		const timeout = window.setTimeout(() => {
			void persistDocument(document, revisionRef.current);
		}, AUTOSAVE_DELAY_MS);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [document, hasUnsavedChanges, isLoading, saveState]);

	const handleWindowShortcuts = useEffectEvent((event: KeyboardEvent) => {
		if (!(event.metaKey || event.ctrlKey)) {
			return;
		}

		const key = event.key.toLowerCase();

		if (key === "s") {
			event.preventDefault();
			void saveCurrentDocument();
			return;
		}

		const wantsUndo = key === "z" && !event.shiftKey;
		const wantsRedo = key === "y" || (key === "z" && event.shiftKey);

		if (!wantsUndo && !wantsRedo) {
			return;
		}

		const activeEditor = activeMarkdownEditorRef.current;

		if (activeEditor) {
			if (wantsUndo && activeEditor.can().undo()) {
				event.preventDefault();
				activeEditor.commands.undo();
				return;
			}

			if (wantsRedo && activeEditor.can().redo()) {
				event.preventDefault();
				activeEditor.commands.redo();
				return;
			}
		}

		const didHandle = wantsUndo ? undoDocumentHistory() : redoDocumentHistory();

		if (didHandle) {
			event.preventDefault();
		}
	});

	useEffect(() => {
		window.addEventListener("keydown", handleWindowShortcuts);

		return () => {
			window.removeEventListener("keydown", handleWindowShortcuts);
		};
	}, []);

	function setActiveMarkdownEditor(blockId: string, editor: TiptapEditor) {
		setActiveBlockId(blockId);
		activeMarkdownEditorRef.current = editor;
		clearFocusRequest();
	}

	function setActiveCodeBlock(blockId: string) {
		setActiveBlockId(blockId);
		activeMarkdownEditorRef.current = null;
		clearFocusRequest();
	}

	function updateMarkdownBlock(blockId: string, markdown: string) {
		startTransition(() => {
			setDocument((currentDocument) =>
				currentDocument
					? {
							...currentDocument,
							blocks: currentDocument.blocks.map((block) =>
								block.id === blockId && block.type === "markdown"
									? { ...block, markdown }
									: block,
							),
						}
					: currentDocument,
			);
		});

		revisionRef.current += 1;
		setHasUnsavedChanges(true);
		setSaveState("idle");
		setErrorMessage(null);
	}

	function updateCodeBlock(nextBlock: CodeBlock) {
		if (!document) {
			return;
		}

		const currentBlock = document.blocks.find(
			(block) => block.id === nextBlock.id,
		);

		if (
			!currentBlock ||
			currentBlock.type !== "code" ||
			(currentBlock.code === nextBlock.code &&
				currentBlock.language === nextBlock.language)
		) {
			return;
		}

		pushDocumentHistorySnapshot();
		applyDocumentBlocks(
			document.blocks.map((block) =>
				block.id === nextBlock.id ? nextBlock : block,
			),
			nextBlock.id,
			null,
		);
	}

	function insertCodeBlock(
		anchorBlockId?: string,
		anchorMarkdownOverride?: string,
	) {
		if (!document || document.blocks.length === 0) {
			return;
		}

		const nextCodeBlock = createBlock("code");
		const trailingTextBlock = createBlock("markdown");
		const resolvedAnchorBlockId =
			anchorBlockId ??
			activeBlockId ??
			document.blocks[document.blocks.length - 1]?.id;

		if (!resolvedAnchorBlockId) {
			return;
		}

		const baseBlocks =
			anchorMarkdownOverride === undefined
				? document.blocks
				: document.blocks.map((block) =>
						block.id === resolvedAnchorBlockId && block.type === "markdown"
							? { ...block, markdown: anchorMarkdownOverride }
							: block,
					);

		pushDocumentHistorySnapshot(baseBlocks, resolvedAnchorBlockId);

		const anchorIndex = baseBlocks.findIndex(
			(block) => block.id === resolvedAnchorBlockId,
		);

		if (anchorIndex === -1) {
			const nextBlocks = [...baseBlocks, nextCodeBlock];

			if (baseBlocks[baseBlocks.length - 1]?.type !== "markdown") {
				nextBlocks.push(trailingTextBlock);
			}

			applyDocumentBlocks(
				nextBlocks,
				nextCodeBlock.id,
				buildFocusRequest(nextCodeBlock, "end"),
			);
			return;
		}

		const blockAfterAnchor = baseBlocks[anchorIndex + 1];
		const insertedBlocks =
			blockAfterAnchor?.type === "markdown"
				? [nextCodeBlock]
				: [nextCodeBlock, trailingTextBlock];

		applyDocumentBlocks(
			[
				...baseBlocks.slice(0, anchorIndex + 1),
				...insertedBlocks,
				...baseBlocks.slice(anchorIndex + 1),
			],
			nextCodeBlock.id,
			buildFocusRequest(nextCodeBlock, "end"),
		);
	}

	function deleteBlock(blockId: string) {
		if (!document) {
			return;
		}

		const blockIndex = document.blocks.findIndex(
			(block) => block.id === blockId,
		);

		if (blockIndex === -1) {
			return;
		}

		if (
			document.blocks.length === 1 &&
			document.blocks[0]?.type === "markdown"
		) {
			return;
		}

		pushDocumentHistorySnapshot();

		const nextBlocks = document.blocks.filter((block) => block.id !== blockId);

		if (nextBlocks.length === 0) {
			const fallbackBlock = createBlock("markdown");

			applyDocumentBlocks(
				[fallbackBlock],
				fallbackBlock.id,
				buildFocusRequest(fallbackBlock, "start"),
			);
			return;
		}

		const focusTarget = getFocusTargetAfterDeletion(
			document.blocks,
			blockIndex,
		);

		applyDocumentBlocks(
			nextBlocks,
			focusTarget?.block.id ?? nextBlocks[0]?.id ?? null,
			focusTarget
				? buildFocusRequest(focusTarget.block, focusTarget.position)
				: null,
		);
	}

	const status = getStatusLabel(saveState, hasUnsavedChanges, lastSavedAt);
	const activeBlock =
		document?.blocks.find((block) => block.id === activeBlockId) ?? null;
	const hasActiveMarkdownEditor =
		activeBlock?.type === "markdown" &&
		activeMarkdownEditorRef.current !== null;

	function runMarkdownAction(action: (editor: TiptapEditor) => void) {
		const editor = activeMarkdownEditorRef.current;

		if (!editor) {
			return;
		}

		action(editor);
	}

	return (
		<Box className="app-shell">
			<header className="app-header">
				<div className="app-header__inner">
					<div>
						<Text c="dimmed" fw={700} size="sm" tt="uppercase">
							Core Editor
						</Text>
						<Title order={1}>Local-first markdown blocks</Title>
						<Text c="dimmed" mt={4} size="sm">
							Editing <Code>{DEFAULT_NOTE_NAME}</Code> through Rust-backed block
							load/save.
						</Text>
					</div>
					<Group gap="sm">
						<Badge color={status.color} radius="sm" variant="light">
							{status.label}
						</Badge>
						<Button
							onClick={() => {
								void saveCurrentDocument();
							}}
							radius="md"
							variant="light"
						>
							Save <Kbd ml="sm">Ctrl/Cmd + S</Kbd>
						</Button>
					</Group>
				</div>
				<div className="app-header__toolbar">
					<div className="app-header__toolbar-inner">
						<Group gap="xs">
							<Button
								disabled={!hasActiveMarkdownEditor}
								onClick={() =>
									runMarkdownAction((editor) => {
										editor.chain().focus().toggleHeading({ level: 1 }).run();
									})
								}
								radius="md"
								size="compact-sm"
								variant="subtle"
							>
								H1
							</Button>
							<Button
								disabled={!hasActiveMarkdownEditor}
								onClick={() =>
									runMarkdownAction((editor) => {
										editor.chain().focus().toggleHeading({ level: 2 }).run();
									})
								}
								radius="md"
								size="compact-sm"
								variant="subtle"
							>
								H2
							</Button>
							<Button
								disabled={!hasActiveMarkdownEditor}
								onClick={() =>
									runMarkdownAction((editor) => {
										editor.chain().focus().toggleHeading({ level: 3 }).run();
									})
								}
								radius="md"
								size="compact-sm"
								variant="subtle"
							>
								H3
							</Button>
							<Button
								disabled={!hasActiveMarkdownEditor}
								onClick={() =>
									runMarkdownAction((editor) => {
										editor.chain().focus().toggleBulletList().run();
									})
								}
								radius="md"
								size="compact-sm"
								variant="subtle"
							>
								Bullets
							</Button>
							<Button
								disabled={!hasActiveMarkdownEditor}
								onClick={() =>
									runMarkdownAction((editor) => {
										editor.chain().focus().toggleOrderedList().run();
									})
								}
								radius="md"
								size="compact-sm"
								variant="subtle"
							>
								Numbered
							</Button>
						</Group>
						<Group gap="xs">
							<Button
								onClick={() => insertCodeBlock()}
								radius="md"
								size="compact-sm"
								variant="light"
							>
								Insert code block
							</Button>
						</Group>
					</div>
				</div>
			</header>

			<div className="editor-scroll">
				<div className="editor-stack">
					{errorMessage ? (
						<Alert color="red" title="Editor error" variant="light">
							{errorMessage}
						</Alert>
					) : null}

					<Text className="document-meta" size="sm">
						Editing <Code>{DEFAULT_NOTE_NAME}</Code>
						<span className="document-meta__path">
							{document?.path ?? "Loading path…"}
						</span>
					</Text>

					{isLoading ? (
						<Paper className="empty-state" radius="xl">
							<Text fw={700} size="lg">
								Loading editor…
							</Text>
							<Text c="dimmed" size="sm">
								Rust is resolving the note file and parsing the block list.
							</Text>
						</Paper>
					) : null}

					{!isLoading && document ? (
						<Paper className="document-paper" radius="xl" shadow="sm">
							<div className="document-flow">
								{document.blocks.map((block) =>
									block.type === "markdown" ? (
										<section
											className="document-flow__section document-flow__section--markdown"
											data-active={activeBlockId === block.id || undefined}
											key={block.id}
										>
											<MarkdownBlockEditor
												active={activeBlockId === block.id}
												block={block as MarkdownBlock}
												focusPosition={
													focusRequest?.blockId === block.id &&
													focusRequest.target === "markdown"
														? focusRequest.position
														: undefined
												}
												focusRequestToken={
													focusRequest?.blockId === block.id &&
													focusRequest.target === "markdown"
														? focusRequest.token
														: undefined
												}
												onChange={(markdown) =>
													updateMarkdownBlock(block.id, markdown)
												}
												onDeleteEmptyBlock={() => deleteBlock(block.id)}
												onFocus={(editor) =>
													setActiveMarkdownEditor(block.id, editor)
												}
												onFocusRequestHandled={clearFocusRequest}
												onInsertCodeBlock={(markdownOverride) =>
													insertCodeBlock(block.id, markdownOverride)
												}
											/>
										</section>
									) : (
										<section
											className="document-flow__section document-flow__section--code"
											data-active={activeBlockId === block.id || undefined}
											key={block.id}
										>
											<div className="code-block-shell">
												<Group
													className="code-block-shell__header"
													justify="space-between"
												>
													<Text c="dimmed" fw={700} size="xs" tt="uppercase">
														Code block
													</Text>
													<Group gap="xs">
														<Button
															color="red"
															onClick={() => deleteBlock(block.id)}
															radius="md"
															size="compact-sm"
															variant="subtle"
														>
															Remove
														</Button>
													</Group>
												</Group>
												<CodeBlockEditor
													block={block as CodeBlock}
													focusRequestToken={
														focusRequest?.blockId === block.id &&
														focusRequest.target === "code"
															? focusRequest.token
															: undefined
													}
													onChange={updateCodeBlock}
													onDeleteEmptyBlock={() => deleteBlock(block.id)}
													onFocus={() => setActiveCodeBlock(block.id)}
													onFocusRequestHandled={clearFocusRequest}
												/>
											</div>
										</section>
									),
								)}
							</div>
						</Paper>
					) : null}
				</div>
			</div>
		</Box>
	);
}

function cloneBlock(block: Block): Block {
	return block.type === "code" ? { ...block } : { ...block };
}

function cloneBlocks(blocks: Block[]) {
	return blocks.map(cloneBlock);
}

function createHistoryEntry(
	blocks: Block[],
	activeBlockId: string | null,
): HistoryEntry {
	return {
		activeBlockId,
		blocks: cloneBlocks(blocks),
	};
}

function normalizeBlocks(blocks: Block[]) {
	const normalizedBlocks: Block[] = [];
	const idMap = new Map<string, string>();

	for (const block of blocks) {
		const clonedBlock = cloneBlock(block);
		const previousBlock = normalizedBlocks[normalizedBlocks.length - 1];

		if (clonedBlock.type === "markdown" && previousBlock?.type === "markdown") {
			normalizedBlocks[normalizedBlocks.length - 1] = {
				...previousBlock,
				markdown: mergeMarkdownContent(
					previousBlock.markdown,
					clonedBlock.markdown,
				),
			};
			idMap.set(clonedBlock.id, previousBlock.id);
			continue;
		}

		normalizedBlocks.push(clonedBlock);
		idMap.set(clonedBlock.id, clonedBlock.id);
	}

	if (normalizedBlocks.length === 0) {
		const fallbackBlock = createBlock("markdown");
		normalizedBlocks.push(fallbackBlock);
		idMap.set(fallbackBlock.id, fallbackBlock.id);
	}

	return { blocks: normalizedBlocks, idMap };
}

function resolveNormalizedBlockId(
	normalized: ReturnType<typeof normalizeBlocks>,
	blockId: string | null,
) {
	if (!blockId) {
		return null;
	}

	const mappedId = normalized.idMap.get(blockId) ?? blockId;
	return normalized.blocks.some((block) => block.id === mappedId)
		? mappedId
		: null;
}

function resolveFocusRequest(
	normalized: ReturnType<typeof normalizeBlocks>,
	focusRequest: FocusRequest | null,
) {
	if (!focusRequest) {
		return null;
	}

	const resolvedBlockId = resolveNormalizedBlockId(
		normalized,
		focusRequest.blockId,
	);

	if (!resolvedBlockId) {
		return null;
	}

	const block = normalized.blocks.find(
		(candidate) => candidate.id === resolvedBlockId,
	);

	if (!block) {
		return null;
	}

	const resolvedTarget: FocusRequest["target"] =
		block.type === "code" ? "code" : "markdown";

	return {
		...focusRequest,
		blockId: block.id,
		target: resolvedTarget,
	};
}

function getFocusTargetAfterDeletion(blocks: Block[], removedIndex: number) {
	const previousBlocks = blocks.slice(0, removedIndex);
	const nextBlocks = blocks.slice(removedIndex + 1);
	const previousMarkdown = [...previousBlocks]
		.reverse()
		.find((block) => block.type === "markdown");
	const nextMarkdown = nextBlocks.find((block) => block.type === "markdown");
	const fallbackBlock =
		previousBlocks[previousBlocks.length - 1] ?? nextBlocks[0] ?? null;
	const targetBlock = previousMarkdown ?? nextMarkdown ?? fallbackBlock;

	if (!targetBlock) {
		return null;
	}

	return {
		block: targetBlock,
		position:
			targetBlock.type === "markdown" && previousMarkdown?.id === targetBlock.id
				? "end"
				: "start",
	} as const;
}

function mergeMarkdownContent(left: string, right: string) {
	if (!left) {
		return right;
	}

	if (!right) {
		return left;
	}

	return `${left.replace(/\n+$/, "")}\n\n${right.replace(/^\n+/, "")}`;
}

function getStatusLabel(
	saveState: SaveState,
	hasUnsavedChanges: boolean,
	lastSavedAt: number | null,
) {
	if (saveState === "saving") {
		return { color: "blue", label: "Saving…" };
	}

	if (saveState === "error") {
		return { color: "red", label: "Save failed" };
	}

	if (hasUnsavedChanges) {
		return { color: "yellow", label: "Unsaved changes" };
	}

	if (saveState === "saved" && lastSavedAt) {
		return {
			color: "teal",
			label: `Saved ${new Date(lastSavedAt).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			})}`,
		};
	}

	return { color: "gray", label: "Ready" };
}

function createBlock(type: Block["type"]): Block {
	const id = createBlockId();

	if (type === "code") {
		return {
			id,
			type: "code",
			language: null,
			code: "",
		};
	}

	return {
		id,
		type: "markdown",
		markdown: "",
	};
}

function createBlockId() {
	const randomId =
		typeof crypto.randomUUID === "function"
			? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
			: `${Date.now()}`;

	return `block-${randomId}`;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	return "An unexpected editor error occurred.";
}

export default App;
