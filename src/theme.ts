import {
	alpha,
	type CSSVariablesResolver,
	colorsTuple,
	createTheme,
	defaultCssVariablesResolver,
} from "@mantine/core";

type AppColorRoles = {
	accent: string;
	background: string;
	border: string;
	danger: string;
	highlight: string;
	paper: string;
	primary: string;
	text: string;
	textSecondary: string;
};

export const appColorRoles = {
	dark: {
		accent: "#FF7A59",
		background: "#1F1F23",
		border: "#3A3A42",
		danger: "#FF5E5E",
		highlight: "#FFD166",
		paper: "#2B2B34",
		primary: "#4B4BE2",
		text: "#F5F5F7",
		textSecondary: "#C3C3C3",
	},
	light: {
		accent: "#FF7A59",
		background: "#F5F5F7",
		border: "#E0E0E5",
		danger: "#FF5E5E",
		highlight: "#FFD166",
		paper: "#FFFFFF",
		primary: "#4B4BE2",
		text: "#1F1F23",
		textSecondary: "#4B4B59",
	},
} satisfies Record<"dark" | "light", AppColorRoles>;

const primaryColors = colorsTuple([
	"#EEF0FF",
	"#DEE0FF",
	"#CDD0FF",
	"#B5B8FF",
	"#8D8FF4",
	"#6868EB",
	"#4B4BE2",
	"#3D3DC2",
	"#31319B",
	"#272776",
]);

const accentColors = colorsTuple([
	"#FFF1EB",
	"#FFE3D9",
	"#FFD0BF",
	"#FFB9A4",
	"#FFA084",
	"#FF876A",
	"#FF7A59",
	"#ED6847",
	"#C85637",
	"#A14328",
]);

const highlightColors = colorsTuple([
	"#FFF9E8",
	"#FFF3D0",
	"#FFECAD",
	"#FFE48A",
	"#FFDB63",
	"#FFD74E",
	"#FFD166",
	"#E3B34A",
	"#BB923A",
	"#91712A",
]);

const dangerColors = colorsTuple([
	"#FFF0F0",
	"#FFE0E0",
	"#FFCACA",
	"#FFAEAE",
	"#FF8E8E",
	"#FF7373",
	"#FF5E5E",
	"#E24C4C",
	"#BD3C3C",
	"#972E2E",
]);

const grayColors = colorsTuple([
	"#FFFFFF",
	"#FBFBFC",
	"#F5F5F7",
	"#ECECF0",
	"#E0E0E5",
	"#ADADB8",
	"#4B4B59",
	"#3A3A46",
	"#2C2C34",
	"#1F1F23",
]);

const darkColors = colorsTuple([
	"#F5F5F7",
	"#E7E7EB",
	"#C3C3C3",
	"#9A9AA4",
	"#4A4A53",
	"#36363F",
	"#2B2B34",
	"#1F1F23",
	"#18181C",
	"#121216",
]);

export const appTheme = createTheme({
	autoContrast: true,
	black: appColorRoles.light.text,
	components: {
		Badge: {
			defaultProps: {
				radius: "sm",
				variant: "light",
			},
		},
		Button: {
			defaultProps: {
				radius: "md",
			},
		},
		Paper: {
			defaultProps: {
				radius: "xl",
				shadow: "sm",
			},
		},
		SegmentedControl: {
			defaultProps: {
				radius: "xl",
				size: "sm",
			},
		},
	},
	cursorType: "pointer",
	defaultGradient: {
		deg: 135,
		from: "primary.6",
		to: "accent.6",
	},
	defaultRadius: "lg",
	fontFamily:
		'"Segoe UI Variable Text", "Aptos", "Segoe UI", "Trebuchet MS", sans-serif',
	fontFamilyMonospace:
		'"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
	headings: {
		fontFamily:
			'"Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Georgia", serif',
		fontWeight: "700",
	},
	other: {
		roles: appColorRoles,
	},
	primaryColor: "primary",
	primaryShade: {
		dark: 5,
		light: 6,
	},
	colors: {
		accent: accentColors,
		danger: dangerColors,
		dark: darkColors,
		gray: grayColors,
		highlight: highlightColors,
		primary: primaryColors,
		red: dangerColors,
	},
	shadows: {
		sm: "0 18px 44px rgba(17, 24, 39, 0.12)",
		md: "0 24px 60px rgba(17, 24, 39, 0.16)",
	},
	white: appColorRoles.light.paper,
});

export const appCssVariablesResolver: CSSVariablesResolver = (theme) => {
	const defaults = defaultCssVariablesResolver(theme);
	const lightRoles = appColorRoles.light;
	const darkRoles = appColorRoles.dark;

	return {
		variables: {
			...defaults.variables,
			"--app-editor-max-width": "58.75rem",
			"--app-shell-max-width": "68.75rem",
		},
		light: {
			...defaults.light,
			"--mantine-color-anchor": lightRoles.accent,
			"--mantine-color-body": lightRoles.background,
			"--mantine-color-default": lightRoles.paper,
			"--mantine-color-default-border": lightRoles.border,
			"--mantine-color-default-color": lightRoles.text,
			"--mantine-color-default-hover": alpha(lightRoles.highlight, 0.16),
			"--mantine-color-dimmed": lightRoles.textSecondary,
			"--mantine-color-error": lightRoles.danger,
			"--mantine-color-placeholder": alpha(lightRoles.textSecondary, 0.88),
			"--mantine-color-text": lightRoles.text,
		},
		dark: {
			...defaults.dark,
			"--mantine-color-anchor": darkRoles.accent,
			"--mantine-color-body": darkRoles.background,
			"--mantine-color-default": darkRoles.paper,
			"--mantine-color-default-border": darkRoles.border,
			"--mantine-color-default-color": darkRoles.text,
			"--mantine-color-default-hover": alpha(darkRoles.highlight, 0.12),
			"--mantine-color-dimmed": darkRoles.textSecondary,
			"--mantine-color-error": darkRoles.danger,
			"--mantine-color-placeholder": alpha(darkRoles.textSecondary, 0.82),
			"--mantine-color-text": darkRoles.text,
		},
	};
};
