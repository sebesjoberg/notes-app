import { Paper, Text, UnstyledButton } from "@mantine/core";
import type {
	SlashCommandDefinition,
	SlashCommandKey,
} from "../config/slashCommands";
import classes from "./SlashCommandSelector.module.css";

type SlashCommandSelectorProps = {
	commands: SlashCommandDefinition[];
	onInvokeCommand: (commandKey: SlashCommandKey) => void;
	selectedCommandKey?: SlashCommandKey;
};

export function SlashCommandSelector({
	commands,
	onInvokeCommand,
	selectedCommandKey,
}: SlashCommandSelectorProps) {
	if (commands.length === 0) {
		return null;
	}

	return (
		<Paper className={classes.root} p="xs" radius="lg" shadow="sm" withBorder>
			{commands.map((command) => (
				<UnstyledButton
					className={classes.option}
					data-selected={selectedCommandKey === command.key || undefined}
					key={command.key}
					onMouseDown={(event) => {
						event.preventDefault();
						onInvokeCommand(command.key);
					}}
				>
					<Text className={classes.label} fw={700} span>
						{command.label}
					</Text>
					<Text c="dimmed" className={classes.alias} span>
						{command.aliases[0]}
					</Text>
					<Text c="dimmed" className={classes.description} size="sm">
						{command.description}
					</Text>
				</UnstyledButton>
			))}
		</Paper>
	);
}
