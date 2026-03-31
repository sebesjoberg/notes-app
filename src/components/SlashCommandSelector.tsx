import { Paper, Text, UnstyledButton } from "@mantine/core";
import type {
	SlashCommandDefinition,
	SlashCommandKey,
} from "../config/slashCommands";
import classes from "./SlashCommandSelector.module.css";

type SlashCommandSelectorProps = {
	commands: SlashCommandDefinition[];
	flip?: boolean;
	onInvokeCommand: (commandKey: SlashCommandKey) => void;
	selectedCommandKey?: SlashCommandKey;
	top?: number;
};

export function SlashCommandSelector({
	commands,
	flip = false,
	onInvokeCommand,
	selectedCommandKey,
	top,
}: SlashCommandSelectorProps) {
	if (commands.length === 0) {
		return null;
	}

	const positionStyle: React.CSSProperties =
		top !== undefined
			? flip
				? { bottom: `calc(100% - ${top}px + 1.5rem)`, top: "auto" }
				: { top: `${top}px` }
			: {};

	return (
		<Paper
			className={classes.root}
			p="xs"
			radius="lg"
			shadow="sm"
			style={positionStyle}
			withBorder
		>
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
