import { Stack, Textarea, TextInput } from "@mantine/core";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useRef,
} from "react";
import type { CodeBlock } from "../note-api";

type CodeBlockEditorProps = {
	block: CodeBlock;
	focusRequestToken?: number;
	onChange: (nextBlock: CodeBlock) => void;
	onDeleteEmptyBlock: () => void;
	onFocus: () => void;
	onFocusRequestHandled: () => void;
};

export function CodeBlockEditor({
	block,
	focusRequestToken,
	onChange,
	onDeleteEmptyBlock,
	onFocus,
	onFocusRequestHandled,
}: CodeBlockEditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		if (focusRequestToken === undefined || !textareaRef.current) {
			return;
		}

		textareaRef.current.focus();
		textareaRef.current.setSelectionRange(
			textareaRef.current.value.length,
			textareaRef.current.value.length,
		);
		onFocus();
		onFocusRequestHandled();
	}, [focusRequestToken, onFocus, onFocusRequestHandled]);

	function handleDeleteKey(
		event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
	) {
		if (
			event.key !== "Backspace" ||
			event.currentTarget.selectionStart !== 0 ||
			event.currentTarget.selectionEnd !== 0
		) {
			return;
		}

		if ((block.language ?? "") === "" && block.code === "") {
			event.preventDefault();
			onDeleteEmptyBlock();
		}
	}

	return (
		<Stack gap="sm">
			<TextInput
				className="code-language-input"
				onChange={(event) =>
					onChange({
						...block,
						language: event.currentTarget.value.trim() || null,
					})
				}
				onFocus={onFocus}
				onKeyDown={handleDeleteKey}
				placeholder="language"
				size="sm"
				value={block.language ?? ""}
				variant="filled"
			/>
			<Textarea
				autosize
				className="code-editor__input"
				minRows={8}
				onChange={(event) =>
					onChange({
						...block,
						code: event.currentTarget.value,
					})
				}
				onFocus={onFocus}
				onKeyDown={handleDeleteKey}
				placeholder="const note = 'ready';"
				ref={textareaRef}
				value={block.code}
				variant="filled"
			/>
		</Stack>
	);
}
