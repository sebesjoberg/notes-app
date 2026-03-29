import slashCommandsConfigJson from "./slashCommands.json";

const SLASH_COMMAND_KEYS = [
	"heading1",
	"heading2",
	"heading3",
	"bullets",
	"numbered",
	"code",
] as const;

const ROOT_KEYS = ["$schema", "commands"] as const;
const COMMAND_KEYS = ["aliases", "description", "key", "label"] as const;
const SLASH_COMMAND_KEY_SET = new Set<string>(SLASH_COMMAND_KEYS);

export type SlashCommandKey = (typeof SLASH_COMMAND_KEYS)[number];

export type SlashCommandDefinition = {
	aliases: string[];
	description: string;
	key: SlashCommandKey;
	label: string;
};

type SlashCommandsConfigFile = {
	$schema?: string;
	commands: Array<{
		aliases: string[];
		description: string;
		key: SlashCommandKey;
		label: string;
	}>;
};

export const SLASH_COMMANDS = parseSlashCommandsConfig(slashCommandsConfigJson);

function parseSlashCommandsConfig(value: unknown) {
	const config = parseConfigRoot(value);
	const seenKeys = new Set<SlashCommandKey>();
	const seenAliases = new Set<string>();

	return config.commands.map((command, index) =>
		parseCommand(command, index, seenKeys, seenAliases),
	);
}

function parseConfigRoot(value: unknown): SlashCommandsConfigFile {
	const root = asRecord(value, "slash commands config");
	assertAllowedKeys(root, ROOT_KEYS, "slash commands config");

	if (!Array.isArray(root.commands)) {
		throw new Error(
			'Invalid slash commands config: expected "commands" to be an array.',
		);
	}

	return {
		$schema:
			root.$schema === undefined
				? undefined
				: parseNonEmptyString(root.$schema, "slash commands config.$schema"),
		commands: root.commands,
	};
}

function parseCommand(
	value: unknown,
	index: number,
	seenKeys: Set<SlashCommandKey>,
	seenAliases: Set<string>,
): SlashCommandDefinition {
	const command = asRecord(value, `slash commands config.commands[${index}]`);
	assertAllowedKeys(command, COMMAND_KEYS, `slash command at index ${index}`);

	const key = parseSlashCommandKey(command.key, index);

	if (seenKeys.has(key)) {
		throw new Error(`Invalid slash commands config: duplicate key "${key}".`);
	}

	seenKeys.add(key);

	return {
		aliases: parseAliases(command.aliases, index, seenAliases),
		description: parseNonEmptyString(
			command.description,
			`slash command "${key}" description`,
		),
		key,
		label: parseNonEmptyString(command.label, `slash command "${key}" label`),
	};
}

function parseSlashCommandKey(value: unknown, index: number): SlashCommandKey {
	const key = parseNonEmptyString(value, `slash command at index ${index} key`);

	if (!SLASH_COMMAND_KEY_SET.has(key)) {
		throw new Error(
			`Invalid slash commands config: unsupported key "${key}" at index ${index}.`,
		);
	}

	return key as SlashCommandKey;
}

function parseAliases(
	value: unknown,
	index: number,
	seenAliases: Set<string>,
): string[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(
			`Invalid slash commands config: expected aliases for command at index ${index} to be a non-empty array.`,
		);
	}

	const localAliases = new Set<string>();

	return value.map((alias, aliasIndex) => {
		const rawAlias = parseNonEmptyString(
			alias,
			`slash command at index ${index} alias ${aliasIndex}`,
		).toLowerCase();

		if (!/^[a-z0-9]+$/.test(rawAlias)) {
			throw new Error(
				`Invalid slash commands config: alias "${rawAlias}" for command at index ${index} must use lowercase letters and digits only.`,
			);
		}

		if (localAliases.has(rawAlias)) {
			throw new Error(
				`Invalid slash commands config: duplicate alias "${rawAlias}" within command at index ${index}.`,
			);
		}

		localAliases.add(rawAlias);

		const normalizedAlias = `/${rawAlias}`;

		if (seenAliases.has(normalizedAlias)) {
			throw new Error(
				`Invalid slash commands config: duplicate alias "${normalizedAlias}" across commands.`,
			);
		}

		seenAliases.add(normalizedAlias);
		return normalizedAlias;
	});
}

function parseNonEmptyString(value: unknown, context: string) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(
			`Invalid slash commands config: expected ${context} to be a non-empty string.`,
		);
	}

	return value.trim();
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(
			`Invalid slash commands config: expected ${context} to be an object.`,
		);
	}

	return value as Record<string, unknown>;
}

function assertAllowedKeys(
	value: Record<string, unknown>,
	allowedKeys: readonly string[],
	context: string,
) {
	const unknownKeys = Object.keys(value).filter(
		(key) => !allowedKeys.includes(key),
	);

	if (unknownKeys.length > 0) {
		throw new Error(
			`Invalid slash commands config: unexpected properties on ${context}: ${unknownKeys.join(", ")}.`,
		);
	}
}
