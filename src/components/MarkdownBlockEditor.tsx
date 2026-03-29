import type { FocusPosition } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { MarkdownBlock } from "../note-api";

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
};

type SlashCommandKey =
	| "heading1"
	| "heading2"
	| "heading3"
	| "bullets"
	| "numbered"
	| "code";

type SlashCommandDefinition = {
	aliases: string[];
	description: string;
	key: SlashCommandKey;
	label: string;
};

const SLASH_COMMANDS: SlashCommandDefinition[] = [
	{
		aliases: ["/header1", "/headers1", "/h1"],
		description: "Large page heading",
		key: "heading1",
		label: "Header 1",
	},
	{
		aliases: ["/header2", "/headers2", "/h2"],
		description: "Section heading",
		key: "heading2",
		label: "Header 2",
	},
	{
		aliases: ["/header3", "/headers3", "/h3"],
		description: "Small section heading",
		key: "heading3",
		label: "Header 3",
	},
	{
		aliases: ["/bullets", "/bullet", "/list"],
		description: "Bullet list",
		key: "bullets",
		label: "Bullets",
	},
	{
		aliases: ["/numbered", "/numbers", "/ordered"],
		description: "Numbered list",
		key: "numbered",
		label: "Numbered",
	},
	{
		aliases: ["/code"],
		description: "Insert a code block below",
		key: "code",
		label: "Code block",
	},
];

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
}: MarkdownBlockEditorProps) {
	const editorRef = useRef<Editor | null>(null);
	const [slashQuery, setSlashQuery] = useState<string | null>(null);
	const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

	const syncSlashQuery = useEffectEvent((editor: Editor) => {
		setSlashQuery(getSlashQuery(editor));
	});

	const handleEditorUpdate = useEffectEvent((editor: Editor) => {
		const nextMarkdown = editor.getMarkdown();

		if (nextMarkdown !== block.markdown) {
			onChange(nextMarkdown);
		}

		syncSlashQuery(editor);
	});

	const handleEditorKeyDown = useEffectEvent(
		(event: KeyboardEvent, currentEditor: Editor) => {
			const nextSlashQuery = getSlashQuery(currentEditor);
			const matchingCommands = getMatchingSlashCommands(nextSlashQuery);

			if (
				event.key === "Backspace" &&
				shouldDeleteEmptyMarkdownBlock(currentEditor)
			) {
				event.preventDefault();
				onDeleteEmptyBlock();
				return true;
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
					applySlashCommand(
						currentEditor,
						selectedCommand.key,
						onInsertCodeBlock,
					);
					syncSlashQuery(currentEditor);
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
				attributes: {
					class: "markdown-editor__content",
				},
				handleKeyDown: (_view, event) => {
					const currentEditor = editorRef.current;

					if (!currentEditor) {
						return false;
					}

					return handleEditorKeyDown(event, currentEditor);
				},
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
		<div className="markdown-editor" data-active={active || undefined}>
			<EditorContent editor={editor} />
			{active && matchingCommands.length > 0 ? (
				<div className="markdown-editor__slash-helper">
					{matchingCommands.map((command, index) => (
						<button
							className="markdown-editor__slash-option"
							data-selected={selectedCommand?.key === command.key || undefined}
							key={command.key}
							onMouseDown={(event) => {
								event.preventDefault();

								if (!editor) {
									return;
								}

								applySlashCommand(editor, command.key, onInsertCodeBlock);
								syncSlashQuery(editor);
								setSelectedSlashIndex(index);
							}}
							type="button"
						>
							<span className="markdown-editor__slash-option-label">
								{command.label}
							</span>
							<span className="markdown-editor__slash-option-alias">
								{command.aliases[0]}
							</span>
							<span className="markdown-editor__slash-option-description">
								{command.description}
							</span>
						</button>
					))}
				</div>
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
	const { $from } = editor.state.selection;
	const from = $from.start();
	const to = $from.end();

	editor.chain().focus().deleteRange({ from, to }).run();

	switch (commandKey) {
		case "heading1":
			editor.chain().focus().toggleHeading({ level: 1 }).run();
			return true;
		case "heading2":
			editor.chain().focus().toggleHeading({ level: 2 }).run();
			return true;
		case "heading3":
			editor.chain().focus().toggleHeading({ level: 3 }).run();
			return true;
		case "bullets":
			editor.chain().focus().toggleBulletList().run();
			return true;
		case "numbered":
			editor.chain().focus().toggleOrderedList().run();
			return true;
		case "code":
			onInsertCodeBlock(editor.getMarkdown());
			return true;
	}
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
