import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/server";
import { INSTRUCTIONS, registerSteering } from "./steering/register.js";
import { TOOLS } from "./tools/index.js";
import { VIEWER_HTML } from "./ui/viewer.generated.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/** Every tool is a pure computation: no side effects, no network. */
const READ_ONLY = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const;

/** MCP Apps (SEP-1865): tool results can be rendered by this sandboxed, self-contained view. */
export const VIEWER_URI = "ui://colors/viewer.html";
const APP_MIME = "text/html;profile=mcp-app";

// The tool list only changes between releases, so clients may cache it for an hour and share it.
const STATIC_LIST_HINT = { ttlMs: 3_600_000, cacheScope: "public" } as const;

// serveStdio may build several servers per connection (a discovery probe is discarded), so this must stay cheap and side-effect free.
export function createServer(): McpServer {
	const server = new McpServer(
		{ name: "colors-mcp-server", version },
		{
			capabilities: { tools: {}, resources: {}, prompts: {} },
			instructions: INSTRUCTIONS,
			cacheHints: {
				"tools/list": STATIC_LIST_HINT,
				"server/discover": STATIC_LIST_HINT,
				"resources/list": STATIC_LIST_HINT,
				"resources/templates/list": STATIC_LIST_HINT,
				"prompts/list": STATIC_LIST_HINT,
			},
		},
	);

	for (const tool of TOOLS) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				outputSchema: tool.outputSchema,
				annotations: READ_ONLY,
				_meta: {
					ui: { resourceUri: VIEWER_URI },
					"ui/resourceUri": VIEWER_URI,
				},
			},
			(args) => tool.handler(args),
		);
	}

	server.registerResource(
		"colors-viewer",
		VIEWER_URI,
		{
			title: "Colors viewer",
			description:
				"Visual view of colors_* tool results: swatches, contrast samples, ramps, themes.",
			mimeType: APP_MIME,
			cacheHint: STATIC_LIST_HINT,
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: APP_MIME,
					text: VIEWER_HTML,
					// no network access at all: the view is fully self-contained
					_meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
				},
			],
		}),
	);

	registerSteering(server);

	return server;
}
