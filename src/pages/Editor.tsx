import {
	Alert,
	Box,
	Button,
	Container,
	Divider,
	Group,
	Paper,
	SegmentedControl,
	Stack,
	Text,
	Title,
	useMantineColorScheme,
} from "@mantine/core";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { Note } from "../components/Note";
import { NoteTabs } from "../components/NoteTabs";
import type { Block, NoteDocument } from "../note-api";
import { loadNote, saveNote } from "../note-api";
import classes from "./Editor.module.css";

type EditorProps = {
	noteNames: string[];
};

type NoteLoadState = {
	document: NoteDocument | null;
	errorMessage: string | null;
	isLoading: boolean;
};

export function Editor({ noteNames }: EditorProps) {
	const { colorScheme, setColorScheme } = useMantineColorScheme();
	const initialNoteName = noteNames[0] ?? "";
	const [activeNoteName, setActiveNoteName] = useState(initialNoteName);
	const [noteStates, setNoteStates] = useState<Record<string, NoteLoadState>>(
		() =>
			Object.fromEntries(
				noteNames.map((noteName) => [noteName, createNoteLoadState()]),
			),
	);

	const loadDocument = useEffectEvent(async (noteName: string) => {
		setNoteStates((currentStates) => ({
			...currentStates,
			[noteName]: {
				...(currentStates[noteName] ?? createNoteLoadState()),
				errorMessage: null,
				isLoading: true,
			},
		}));

		try {
			const loadedDocument = await loadNote(noteName);

			startTransition(() => {
				setNoteStates((currentStates) => ({
					...currentStates,
					[noteName]: {
						document: loadedDocument,
						errorMessage: null,
						isLoading: false,
					},
				}));
			});
		} catch (error) {
			startTransition(() => {
				setNoteStates((currentStates) => ({
					...currentStates,
					[noteName]: {
						document: null,
						errorMessage: getErrorMessage(error),
						isLoading: false,
					},
				}));
			});
		}
	});

	useEffect(() => {
		if (initialNoteName) {
			void loadDocument(initialNoteName);
		}
	}, [initialNoteName]);

	async function handleSelectNote(noteName: string) {
		setActiveNoteName(noteName);

		const noteState = noteStates[noteName];

		if (!noteState?.document && !noteState?.isLoading) {
			await loadDocument(noteName);
		}
	}

	const activeNoteState = noteStates[activeNoteName] ?? createNoteLoadState();
	const openedNotes = noteNames.filter(
		(noteName) => noteStates[noteName]?.document,
	);

	return (
		<Box className={classes.root}>
			<Paper
				className={classes.header}
				component="header"
				p={0}
				radius={0}
				shadow="none"
				withBorder
			>
				<Container className={classes.headerInner} size="xl">
					<div>
						<Text c="dimmed" fw={700} size="sm" tt="uppercase">
							Editor
						</Text>
						<Title order={1}>Local-first markdown blocks</Title>
						<Text c="dimmed" mt={4} size="sm">
							Switch between cached notes without reloading after first open.
						</Text>
					</div>
					<div className={classes.themeSwitch}>
						<Text c="dimmed" fw={700} size="xs" tt="uppercase">
							Theme
						</Text>
						<SegmentedControl
							data={[
								{ label: "Light", value: "light" },
								{ label: "Dark", value: "dark" },
							]}
							onChange={(value) => setColorScheme(value as "dark" | "light")}
							value={colorScheme === "auto" ? "light" : colorScheme}
						/>
					</div>
				</Container>
				<Divider />
				<div className={classes.tabsBar}>
					<Container size="xl">
						<NoteTabs
							activeNoteName={activeNoteName}
							noteNames={noteNames}
							onSelect={(noteName) => {
								void handleSelectNote(noteName);
							}}
						/>
					</Container>
				</div>
			</Paper>

			{activeNoteState.errorMessage && !activeNoteState.document ? (
				<Container className={classes.feedback} size="md">
					<Stack gap="md">
						<Alert color="danger" title="Could not load note" variant="light">
							{activeNoteState.errorMessage}
						</Alert>
						<Group>
							<Button
								onClick={() => {
									void loadDocument(activeNoteName);
								}}
								variant="light"
							>
								Retry
							</Button>
						</Group>
					</Stack>
				</Container>
			) : null}

			{activeNoteState.isLoading && !activeNoteState.document ? (
				<Container className={classes.feedback} size="md">
					<Paper className={classes.emptyState} p="xl" radius="xl" withBorder>
						<Text fw={700} size="lg">
							Loading editor…
						</Text>
						<Text c="dimmed" size="sm">
							Rust is resolving the note file and parsing the block list.
						</Text>
					</Paper>
				</Container>
			) : null}

			<div className={classes.notePanels}>
				{openedNotes.map((noteName) => {
					const document = noteStates[noteName]?.document;

					if (!document) {
						return null;
					}

					return (
						<Note
							active={activeNoteName === noteName}
							initialDocument={document}
							key={noteName}
							onSave={(targetNoteName: string, blocks: Block[]) =>
								saveNote(targetNoteName, blocks)
							}
						/>
					);
				})}
			</div>
		</Box>
	);
}

function createNoteLoadState(): NoteLoadState {
	return {
		document: null,
		errorMessage: null,
		isLoading: false,
	};
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
