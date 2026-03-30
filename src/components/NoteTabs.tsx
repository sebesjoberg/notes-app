import { Tabs } from "@mantine/core";

type NoteTabsProps = {
	activeNoteName: string;
	noteNames: string[];
	onSelect: (noteName: string) => void;
};

export function NoteTabs({
	activeNoteName,
	noteNames,
	onSelect,
}: NoteTabsProps) {
	return (
		<Tabs
			onChange={(value) => {
				if (value) {
					onSelect(value);
				}
			}}
			radius="md"
			value={activeNoteName}
			variant="outline"
		>
			<Tabs.List aria-label="Open notes">
				{noteNames.map((noteName) => (
					<Tabs.Tab key={noteName} value={noteName}>
						{noteName}
					</Tabs.Tab>
				))}
			</Tabs.List>
		</Tabs>
	);
}
