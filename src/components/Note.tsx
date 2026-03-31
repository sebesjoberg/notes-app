import {
	Alert,
	Badge,
	Button,
	Code,
	Container,
	Divider,
	Group,
	Kbd,
	Paper,
	Stack,
	Text,
} from "@mantine/core";
import type { Editor as TiptapEditor } from "@tiptap/react";
import {
	startTransition,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import type {
	Block,
	CodeBlock,
	MarkdownBlock,
	NoteDocument,
	SaveResult,
} from "../note-api";
import { CodeBlockEditor } from "./blocks/CodeBlockEditor";
import { MarkdownBlockEditor } from "./blocks/MarkdownBlockEditor";
import classes from "./Note.module.css";

const AUTOSAVE_DELAY_MS = 750;
const MAX_NOTE_HISTORY = 200;

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

type NoteProps = {
	active: boolean;
	initialDocument: NoteDocument;
	onSave: (noteName: string, blocks: Block[]) => Promise<SaveResult>;
};

export function Note({ active, initialDocument, onSave }: NoteProps) {
	const [document, setDocument] = useState<NoteDocument>(() => {
		const normalized = normalizeBlocks(initialDocument.blocks);

		return {
			...initialDocument,
			blocks: normalized.blocks,
		};
	});
	const [activeBlockId, setActiveBlockId] = useState<string | null>(() => {
		const normalized = normalizeBlocks(initialDocument.blocks);
		return normalized.blocks[0]?.id ?? null;
	});
	const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(() => {
		const normalized = normalizeBlocks(initialDocument.blocks);
		const firstBlock = normalized.blocks[0] ?? null;

		return firstBlock
			? buildFocusRequestForToken(1, firstBlock, "start")
			: null;
	});
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
	const activeMarkdownEditorRef = useRef<TiptapEditor | null>(null);
	const historyRef = useRef<{ future: HistoryEntry[]; past: HistoryEntry[] }>({
		future: [],
		past: [],
	});
	const focusTokenRef = useRef(1);
	const revisionRef = useRef(0);

	function buildFocusRequest(
		block: Block,
		position: FocusRequest["position"] = "end",
	): FocusRequest {
		focusTokenRef.current += 1;
		return buildFocusRequestForToken(focusTokenRef.current, block, position);
	}

	function clearFocusRequest() {
		setFocusRequest(null);
	}

	function pushDocumentHistorySnapshot(
		blocks = document.blocks,
		historyActiveBlockId = activeBlockId,
	) {
		const nextPast = [
			...historyRef.current.past,
			createHistoryEntry(blocks, historyActiveBlockId),
		].slice(-MAX_NOTE_HISTORY);

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
			setDocument((currentDocument) => ({
				...currentDocument,
				blocks: nextBlocks,
			}));
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
			setDocument((currentDocument) => ({
				...currentDocument,
				blocks: normalized.blocks,
			}));
			setActiveBlockId(restoredActiveBlockId);
			setFocusRequest(
				restoredBlock ? buildFocusRequest(restoredBlock, "end") : null,
			);
		});
	}

	function undoDocumentHistory() {
		const previousEntry = historyRef.current.past.at(-1);

		if (!previousEntry) {
			return false;
		}

		historyRef.current = {
			future: [
				...historyRef.current.future,
				createHistoryEntry(document.blocks, activeBlockId),
			].slice(-MAX_NOTE_HISTORY),
			past: historyRef.current.past.slice(0, -1),
		};

		restoreHistoryEntry(previousEntry);
		return true;
	}

	function redoDocumentHistory() {
		const nextEntry = historyRef.current.future.at(-1);

		if (!nextEntry) {
			return false;
		}

		historyRef.current = {
			future: historyRef.current.future.slice(0, -1),
			past: [
				...historyRef.current.past,
				createHistoryEntry(document.blocks, activeBlockId),
			].slice(-MAX_NOTE_HISTORY),
		};

		restoreHistoryEntry(nextEntry);
		return true;
	}

	const persistDocument = useEffectEvent(
		async (snapshot: NoteDocument, revision: number) => {
			setSaveState("saving");

			try {
				const result = await onSave(snapshot.noteName, snapshot.blocks);

				startTransition(() => {
					setDocument((currentDocument) => ({
						...currentDocument,
						path: result.path,
					}));
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
		if (saveState === "saving") {
			return;
		}

		await persistDocument(document, revisionRef.current);
	});

	useEffect(() => {
		if (!hasUnsavedChanges || saveState === "saving") {
			return;
		}

		const timeout = window.setTimeout(() => {
			void persistDocument(document, revisionRef.current);
		}, AUTOSAVE_DELAY_MS);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [document, hasUnsavedChanges, saveState]);

	const handleWindowShortcuts = useEffectEvent((event: KeyboardEvent) => {
		if (!active || !(event.metaKey || event.ctrlKey)) {
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
			setDocument((currentDocument) => ({
				...currentDocument,
				blocks: currentDocument.blocks.map((block) =>
					block.id === blockId && block.type === "markdown"
						? { ...block, markdown }
						: block,
				),
			}));
		});

		revisionRef.current += 1;
		setHasUnsavedChanges(true);
		setSaveState("idle");
		setErrorMessage(null);
	}

	function updateCodeBlock(nextBlock: CodeBlock) {
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
		if (document.blocks.length === 0) {
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
		document.blocks.find((block) => block.id === activeBlockId) ?? null;
	const hasActiveMarkdownEditor =
		active &&
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
		<section
			aria-hidden={!active}
			className={classes.panel}
			data-active={active || undefined}
		>
			<Paper
				className={classes.header}
				component="header"
				p={0}
				radius={0}
				shadow="none"
				withBorder
			>
				<Container className={classes.toolbar} size="xl">
					<Group gap="xs">
						<Button
							disabled={!hasActiveMarkdownEditor}
							onClick={() =>
								runMarkdownAction((editor) => {
									editor.chain().focus().toggleHeading({ level: 1 }).run();
								})
							}
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
							size="compact-sm"
							variant="subtle"
						>
							Numbered
						</Button>
					</Group>
					<Button
						onClick={() => insertCodeBlock()}
						size="compact-sm"
						variant="light"
					>
						Insert code block
					</Button>
				</Container>
				<Divider />
				<Container className={classes.meta} size="xl">
					<Group className={classes.status} gap="sm">
						<Badge color={status.color}>{status.label}</Badge>
						<Button
							onClick={() => {
								void saveCurrentDocument();
							}}
							variant="light"
						>
							Save <Kbd ml="sm">Ctrl/Cmd + S</Kbd>
						</Button>
					</Group>
					<Stack gap={2}>
						<Text c="dimmed" size="sm">
							Editing <Code>{document.noteName}</Code>
						</Text>
						<Text c="dimmed" size="xs">
							{document.path}
						</Text>
					</Stack>
				</Container>
			</Paper>

			<div className={classes.content}>
				<Stack gap="md">
					{errorMessage ? (
						<Alert color="danger" title="Editor error" variant="light">
							{errorMessage}
						</Alert>
					) : null}

					<Paper p="xl" radius="xl" withBorder>
						<Stack className={classes.documentFlow} gap="sm">
							{document.blocks.map((block) =>
								block.type === "markdown" ? (
									<div key={block.id}>
										<MarkdownBlockEditor
											active={activeBlockId === block.id && active}
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
									</div>
								) : (
									<Paper key={block.id} p="md" radius="lg" withBorder>
										<Group justify="space-between" mb="sm">
											<Text c="dimmed" fw={700} size="xs" tt="uppercase">
												Code block
											</Text>
											<Button
												color="danger"
												onClick={() => deleteBlock(block.id)}
												size="compact-sm"
												variant="subtle"
											>
												Remove
											</Button>
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
									</Paper>
								),
							)}
						</Stack>
					</Paper>
				</Stack>
			</div>
		</section>
	);
}

function buildFocusRequestForToken(
	token: number,
	block: Block,
	position: FocusRequest["position"],
): FocusRequest {
	return {
		blockId: block.id,
		position,
		target: block.type === "code" ? "code" : "markdown",
		token,
	};
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
		return { color: "primary", label: "Saving…" };
	}

	if (saveState === "error") {
		return { color: "danger", label: "Save failed" };
	}

	if (hasUnsavedChanges) {
		return { color: "highlight", label: "Unsaved changes" };
	}

	if (saveState === "saved" && lastSavedAt) {
		return {
			color: "primary",
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
