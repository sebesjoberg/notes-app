import "@mantine/core/styles.css";
import "@mantine/tiptap/styles.css";
import { MantineProvider } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { appCssVariablesResolver, appTheme } from "./theme";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<MantineProvider
			cssVariablesResolver={appCssVariablesResolver}
			defaultColorScheme="light"
			theme={appTheme}
		>
			<App />
		</MantineProvider>
	</React.StrictMode>,
);
