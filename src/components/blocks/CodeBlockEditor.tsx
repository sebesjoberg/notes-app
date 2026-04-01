import { Select, Stack } from "@mantine/core";
import Editor, { type OnMount } from "@monaco-editor/react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useRef,
} from "react";
import type { CodeBlock } from "../../note-api";

const LANGUAGES = [
	"abap",
	"bash",
	"c",
	"clojure",
	"coffeescript",
	"cpp",
	"csharp",
	"css",
	"dart",
	"dockerfile",
	"elixir",
	"go",
	"graphql",
	"handlebars",
	"html",
	"java",
	"javascript",
	"json",
	"julia",
	"kotlin",
	"less",
	"lua",
	"markdown",
	"mysql",
	"objective-c",
	"pascal",
	"perl",
	"php",
	"plaintext",
	"powershell",
	"python",
	"r",
	"ruby",
	"rust",
	"sass",
	"scala",
	"scss",
	"shell",
	"sql",
	"swift",
	"typescript",
	"xml",
	"yaml",
];

type CodeBlockEditorProps = {
	active: boolean;
	block: CodeBlock;
	focusPosition?: "start" | "end";
	focusRequestToken?: number;
	onChange: (nextBlock: CodeBlock) => void;
	onDeleteEmptyBlock: () => void;
	onFocus: () => void;
	onFocusRequestHandled: () => void;
	onNavigateNext: () => void;
	onNavigatePrevious: () => void;
};

type MonacoEditor = Parameters<OnMount>[0];

export function CodeBlockEditor({
	block,
	focusPosition = "end",
	focusRequestToken,
	onChange,
	onDeleteEmptyBlock,
	onFocus,
	onFocusRequestHandled,
	onNavigateNext,
	onNavigatePrevious,
}: CodeBlockEditorProps) {
	const editorRef = useRef<MonacoEditor | null>(null);

	useEffect(() => {
		if (focusRequestToken === undefined || !editorRef.current) {
			return;
		}

		const editor = editorRef.current;
		editor.focus();

		const model = editor.getModel();

		if (model) {
			if (focusPosition === "start") {
				editor.setPosition({ lineNumber: 1, column: 1 });
			} else {
				const lastLine = model.getLineCount();
				const lastColumn = model.getLineMaxColumn(lastLine);
				editor.setPosition({ lineNumber: lastLine, column: lastColumn });
			}
		}

		onFocus();
		onFocusRequestHandled();
	}, [focusPosition, focusRequestToken, onFocus, onFocusRequestHandled]);

	function handleEditorMount(editor: MonacoEditor) {
		editorRef.current = editor;

		editor.onDidFocusEditorText(() => {
			onFocus();
		});

		editor.onKeyDown((event) => {
			const position = editor.getPosition();
			const model = editor.getModel();

			if (!position || !model) {
				return;
			}

			if (
				event.keyCode === 1 /* Backspace */ &&
				position.lineNumber === 1 &&
				position.column === 1 &&
				(block.language ?? "") === "" &&
				model.getValue() === ""
			) {
				event.preventDefault();
				event.stopPropagation();
				onDeleteEmptyBlock();
				return;
			}

			const suggestWidget = editor.getContribution("editor.contrib.suggestController") as
				| { model?: { state?: number } }
				| null;
			const isSuggestVisible = suggestWidget?.model?.state !== undefined && suggestWidget.model.state !== 0;

			if (event.shiftKey || isSuggestVisible) {
				return;
			}

			if (
				event.keyCode === 16 /* UpArrow */ &&
				position.lineNumber === 1
			) {
				event.preventDefault();
				event.stopPropagation();
				onNavigatePrevious();
			}

			if (
				event.keyCode === 18 /* DownArrow */ &&
				position.lineNumber === model.getLineCount()
			) {
				event.preventDefault();
				event.stopPropagation();
				onNavigateNext();
			}
		});
	}

	function handleLanguageKeyDown(
		event: ReactKeyboardEvent<HTMLInputElement>,
	) {
		if (
			event.key === "Backspace" &&
			event.currentTarget.selectionStart === 0 &&
			event.currentTarget.selectionEnd === 0 &&
			(block.language ?? "") === "" &&
			block.code === ""
		) {
			event.preventDefault();
			onDeleteEmptyBlock();
		}
	}

	return (
		<Stack gap="sm">
			<Select
				clearable
				data={LANGUAGES}
				onChange={(value) =>
					onChange({ ...block, language: value || null })
				}
				onFocus={onFocus}
				onKeyDown={handleLanguageKeyDown}
				placeholder="Select language"
				searchable
				size="sm"
				value={block.language ?? null}
				variant="filled"
			/>
			<Editor
				defaultValue={block.code}
				height="220px"
				key={block.id}
				language={block.language ?? "plaintext"}
				onChange={(value) =>
					onChange({ ...block, code: value ?? "" })
				}
				onMount={handleEditorMount}
				options={{
					automaticLayout: true,
					fontSize: 14,
					fontFamily:
						"'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
					lineNumbers: "on",
					minimap: { enabled: false },
					overviewRulerLanes: 0,
					renderLineHighlight: "none",
					scrollBeyondLastLine: false,
					scrollbar: {
						vertical: "auto",
						horizontal: "auto",
					},
					wordWrap: "on",
				}}
			/>
		</Stack>
	);
}
