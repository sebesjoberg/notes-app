import { RichTextEditor } from "@mantine/tiptap";
import type { FocusPosition } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
	SLASH_COMMANDS,
	type SlashCommandDefinition,
	type SlashCommandKey,
} from "../../config/slashCommands";
import type { MarkdownBlock } from "../../note-api";
import { SlashCommandSelector } from "../SlashCommandSelector";
import classes from "./MarkdownBlockEditor.module.css";

type MarkdownBlockEditorProps = {
	active: boolean;
	block: MarkdownBlock;
	focusPosition?: FocusPosition;
	focusRequestToken?: number;
	onChange: (markdown: string) => void;
	onDeleteEmptyBlock: () => void;
	onFocus: (editor: Editor) => void;
	onFocusRequestHandled: () => void;
	onInsertCodeBlock: (markdownOverride?: string) => void;
	onNavigateNext: () => void;
	onNavigatePrevious: () => void;
};

export function MarkdownBlockEditor({
	active,
	block,
	focusPosition = "end",
	focusRequestToken,
	onChange,
	onDeleteEmptyBlock,
	onFocus,
	onFocusRequestHandled,
	onInsertCodeBlock,
	onNavigateNext,
	onNavigatePrevious,
}: MarkdownBlockEditorProps) {
	const editorRef = useRef<Editor | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [slashQuery, setSlashQuery] = useState<string | null>(null);
	const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
	const [selectorPosition, setSelectorPosition] = useState<{
		flip: boolean;
		top: number;
	} | null>(null);

	const syncSlashQuery = useEffectEvent((editor: Editor) => {
		const query = getSlashQuery(editor);
		setSlashQuery(query);

		if (query && rootRef.current) {
			const coords = editor.view.coordsAtPos(editor.state.selection.from);
			const rootRect = rootRef.current.getBoundingClientRect();
			const caretTop = coords.bottom - rootRect.top;
			const spaceBelow = window.innerHeight - coords.bottom;
			setSelectorPosition({ flip: spaceBelow < 260, top: caretTop });
		} else {
			setSelectorPosition(null);
		}
	});

	const handleEditorUpdate = useEffectEvent((editor: Editor) => {
		const nextMarkdown = editor.getMarkdown();

		if (nextMarkdown !== block.markdown) {
			onChange(nextMarkdown);
		}

		syncSlashQuery(editor);
	});

	const invokeSlashCommand = useEffectEvent(
		(commandKey: SlashCommandKey, targetEditor?: Editor) => {
			const currentEditor = targetEditor ?? editorRef.current ?? editor;

			if (!currentEditor) {
				return;
			}

			applySlashCommand(currentEditor, commandKey, onInsertCodeBlock);
			syncSlashQuery(currentEditor);
		},
	);

	const handleEditorKeyDown = useEffectEvent(
		(event: KeyboardEvent, currentEditor: Editor) => {
			const nextSlashQuery = getSlashQuery(currentEditor);
			const matchingCommands = getMatchingSlashCommands(nextSlashQuery);

			if (event.key === "Backspace" && !event.ctrlKey && !event.metaKey) {
				const { selection } = currentEditor.state;

				if (selection.empty && selection.$from.parentOffset === 0) {
					const parentNode = selection.$from.parent;

					if (parentNode.type.name === "heading") {
						event.preventDefault();
						currentEditor
							.chain()
							.focus()
							.toggleHeading({ level: parentNode.attrs.level })
							.run();
						return true;
					}

					const grandparent =
						selection.$from.depth >= 2
							? selection.$from.node(-1)
							: null;

					if (grandparent?.type.name === "listItem") {
						event.preventDefault();
						currentEditor
							.chain()
							.focus()
							.liftListItem("listItem")
							.run();
						return true;
					}

					if (shouldDeleteEmptyMarkdownBlock(currentEditor)) {
						event.preventDefault();
						onDeleteEmptyBlock();
						return true;
					}
				}
			}

			if (matchingCommands.length > 0 && event.key === "ArrowDown") {
				event.preventDefault();
				setSelectedSlashIndex((currentIndex) =>
					wrapSlashIndex(currentIndex + 1, matchingCommands.length),
				);
				return true;
			}

			if (matchingCommands.length > 0 && event.key === "ArrowUp") {
				event.preventDefault();
				setSelectedSlashIndex((currentIndex) =>
					wrapSlashIndex(currentIndex - 1, matchingCommands.length),
				);
				return true;
			}

			if (matchingCommands.length > 0 && event.key === "Enter") {
				const selectedCommand = getSelectedSlashCommand(
					nextSlashQuery,
					matchingCommands,
					selectedSlashIndex,
				);

				if (selectedCommand) {
					event.preventDefault();
					invokeSlashCommand(selectedCommand.key, currentEditor);
					return true;
				}
			}

			if (event.key === "ArrowUp" && !event.shiftKey) {
				if (currentEditor.view.endOfTextblock("up")) {
					event.preventDefault();
					onNavigatePrevious();
					return true;
				}
			}

			if (event.key === "ArrowDown" && !event.shiftKey) {
				if (currentEditor.view.endOfTextblock("down")) {
					event.preventDefault();
					onNavigateNext();
					return true;
				}
			}

			return false;
		},
	);

	const handleEditorTextInput = useEffectEvent(
		(text: string, currentEditor: Editor) => {
			if (text !== " ") {
				return false;
			}

			const nextSlashQuery = getSlashQuery(currentEditor);
			const exactCommand = nextSlashQuery
				? resolveSlashCommand(nextSlashQuery)
				: null;

			if (!exactCommand) {
				return false;
			}

			const didApply = applySlashCommand(
				currentEditor,
				exactCommand.key,
				onInsertCodeBlock,
			);

			if (didApply) {
				syncSlashQuery(currentEditor);
			}

			return didApply;
		},
	);

	const editor = useEditor(
		{
			immediatelyRender: true,
			extensions: [
				Markdown,
				StarterKit.configure({
					blockquote: false,
					bold: false,
					codeBlock: false,
					dropcursor: false,
					gapcursor: false,
					horizontalRule: false,
					italic: false,
					link: false,
					strike: false,
					underline: false,
				}),
			],
			content: block.markdown,
			contentType: "markdown",
			editorProps: {
				handleTextInput: (_view, _from, _to, text) => {
					const currentEditor = editorRef.current;

					if (!currentEditor) {
						return false;
					}

					return handleEditorTextInput(text, currentEditor);
				},
			},
			onCreate: ({ editor }) => {
				editorRef.current = editor;
				syncSlashQuery(editor);
			},
			onDestroy: () => {
				editorRef.current = null;
				setSlashQuery(null);
			},
			onFocus: ({ editor }) => {
				onFocus(editor);
				syncSlashQuery(editor);
			},
			onSelectionUpdate: ({ editor }) => {
				syncSlashQuery(editor);
			},
			onUpdate: ({ editor }) => {
				handleEditorUpdate(editor);
			},
		},
		[block.id],
	);

	useEffect(() => {
		if (!editor) {
			return;
		}

		editorRef.current = editor;

		const dom = editor.view.dom;

		function onKeyDown(event: KeyboardEvent) {
			if (handleEditorKeyDown(event, editor)) {
				event.stopPropagation();
			}
		}

		dom.addEventListener("keydown", onKeyDown, true);
		return () => dom.removeEventListener("keydown", onKeyDown, true);
	}, [editor]);

	useEffect(() => {
		if (!editor) {
			return;
		}

		const currentMarkdown = editor.getMarkdown();

		if (currentMarkdown === block.markdown) {
			return;
		}

		editor.commands.setContent(block.markdown, {
			contentType: "markdown",
			emitUpdate: false,
		});
		syncSlashQuery(editor);
	}, [block.markdown, editor]);

	useEffect(() => {
		if (active && editor) {
			onFocus(editor);
			syncSlashQuery(editor);
		}
	}, [active, editor, onFocus]);

	useEffect(() => {
		if (!active) {
			setSlashQuery(null);
			setSelectedSlashIndex(0);
		}
	}, [active]);

	useEffect(() => {
		const matchingCommands = getMatchingSlashCommands(slashQuery);

		if (matchingCommands.length === 0) {
			setSelectedSlashIndex(0);
			return;
		}

		setSelectedSlashIndex(getDefaultSlashIndex(slashQuery, matchingCommands));
	}, [slashQuery]);

	useEffect(() => {
		if (!editor || focusRequestToken === undefined) {
			return;
		}

		editor.commands.focus(focusPosition);
		onFocus(editor);
		syncSlashQuery(editor);
		onFocusRequestHandled();
	}, [
		editor,
		focusPosition,
		focusRequestToken,
		onFocus,
		onFocusRequestHandled,
	]);

	const matchingCommands = getMatchingSlashCommands(slashQuery);
	const selectedCommand = getSelectedSlashCommand(
		slashQuery,
		matchingCommands,
		selectedSlashIndex,
	);

	return (
		<div
			ref={rootRef}
			className={classes.root}
			data-active={active || undefined}
		>
			<RichTextEditor
				classNames={{
					root: classes.editor,
					content: classes.editorContent,
				}}
				editor={editor}
			>
				<RichTextEditor.Content />
			</RichTextEditor>
			{active && matchingCommands.length > 0 && selectorPosition ? (
				<SlashCommandSelector
					commands={matchingCommands}
					flip={selectorPosition.flip}
					onInvokeCommand={(commandKey) => {
						invokeSlashCommand(commandKey);
						setSelectedSlashIndex(
							matchingCommands.findIndex(
								(command) => command.key === commandKey,
							),
						);
					}}
					selectedCommandKey={selectedCommand?.key}
					top={selectorPosition.top}
				/>
			) : null}
		</div>
	);
}

function shouldDeleteEmptyMarkdownBlock(editor: Editor) {
	return (
		editor.isEmpty &&
		editor.state.selection.empty &&
		editor.state.selection.$from.parentOffset === 0
	);
}

function applySlashCommand(
	editor: Editor,
	commandKey: SlashCommandKey,
	onInsertCodeBlock: (markdownOverride?: string) => void,
) {
	const slashCommandRange = getSlashCommandRange(editor);

	if (!slashCommandRange) {
		return false;
	}

	switch (commandKey) {
		case "heading1":
			return createSlashCommandChain(editor, slashCommandRange)
				.toggleHeading({ level: 1 })
				.run();
		case "heading2":
			return createSlashCommandChain(editor, slashCommandRange)
				.toggleHeading({ level: 2 })
				.run();
		case "heading3":
			return createSlashCommandChain(editor, slashCommandRange)
				.toggleHeading({ level: 3 })
				.run();
		case "bullets":
			return createSlashCommandChain(editor, slashCommandRange)
				.toggleBulletList()
				.run();
		case "numbered":
			return createSlashCommandChain(editor, slashCommandRange)
				.toggleOrderedList()
				.run();
		case "code": {
			const didRemoveSlashCommand = editor
				.chain()
				.setMeta("addToHistory", false)
				.focus()
				.deleteRange(slashCommandRange)
				.run();

			if (!didRemoveSlashCommand) {
				return false;
			}

			onInsertCodeBlock(editor.getMarkdown());
			return true;
		}
	}
}

function getSlashCommandRange(editor: Editor) {
	if (!editor.state.selection.empty) {
		return null;
	}

	const { $from } = editor.state.selection;

	return {
		from: $from.start(),
		to: $from.end(),
	};
}

function createSlashCommandChain(
	editor: Editor,
	slashCommandRange: { from: number; to: number },
) {
	return editor
		.chain()
		.setMeta("addToHistory", false)
		.focus()
		.deleteRange(slashCommandRange);
}

function getSlashQuery(editor: Editor) {
	if (!editor.state.selection.empty) {
		return null;
	}

	const parent = editor.state.selection.$from.parent;

	if (parent.type.name !== "paragraph") {
		return null;
	}

	const query = parent.textContent.trim().toLowerCase();

	if (!/^\/[a-z0-9]*$/.test(query)) {
		return null;
	}

	return query;
}

function resolveSlashCommand(query: string) {
	return (
		SLASH_COMMANDS.find((command) => command.aliases.includes(query)) ?? null
	);
}

function getMatchingSlashCommands(query: string | null) {
	if (!query) {
		return [];
	}

	return SLASH_COMMANDS.filter((command) =>
		command.aliases.some((alias) => alias.startsWith(query)),
	);
}

function getDefaultSlashIndex(
	query: string | null,
	commands: SlashCommandDefinition[],
) {
	if (!query || commands.length === 0) {
		return 0;
	}

	const exactMatchIndex = commands.findIndex((command) =>
		command.aliases.includes(query),
	);

	return exactMatchIndex === -1 ? 0 : exactMatchIndex;
}

function getSelectedSlashCommand(
	query: string | null,
	commands: SlashCommandDefinition[],
	selectedIndex: number,
) {
	if (commands.length === 0) {
		return null;
	}

	const normalizedIndex =
		query && resolveSlashCommand(query)
			? getDefaultSlashIndex(query, commands)
			: wrapSlashIndex(selectedIndex, commands.length);

	return commands[normalizedIndex] ?? null;
}

function wrapSlashIndex(index: number, length: number) {
	return ((index % length) + length) % length;
}
