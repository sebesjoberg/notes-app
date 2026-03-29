import "@mantine/core/styles.css";
import { createTheme, MantineProvider } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const theme = createTheme({
	fontFamily:
		'"Segoe UI Variable Text", "Segoe UI", "Trebuchet MS", sans-serif',
	headings: {
		fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif',
	},
	primaryColor: "teal",
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<MantineProvider defaultColorScheme="light" theme={theme}>
			<App />
		</MantineProvider>
	</React.StrictMode>,
);
