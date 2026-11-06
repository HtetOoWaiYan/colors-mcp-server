import {
	App,
	applyDocumentTheme,
	applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { type Json, render } from "./render.js";

const root = document.getElementById("app") as HTMLElement;

const app = new App(
	{ name: "colors-viewer", version: "1.0.0" },
	{},
	{ autoResize: true },
);
app.ontoolresult = (result) => {
	const sc = (result as { structuredContent?: Json }).structuredContent;
	if (sc) root.replaceChildren(render(sc));
};
app.onhostcontextchanged = (ctx) => {
	if (ctx.theme) applyDocumentTheme(ctx.theme);
	if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
};
app.connect().catch(() => {
	/* opened outside a host: stays on the placeholder */
});
