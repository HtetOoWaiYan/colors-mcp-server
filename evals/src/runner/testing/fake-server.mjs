import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "fake", version: "0.0.1" });
server.registerTool(
	"echo",
	{ description: "Echo text", inputSchema: { text: z.string() } },
	async ({ text }) => ({
		content: [{ type: "text", text: `echo:${text}` }],
		structuredContent: { hidden: true },
	}),
);
server.registerTool(
	"fail",
	{ description: "Always fails", inputSchema: {} },
	async () => ({
		isError: true,
		content: [{ type: "text", text: "nope" }],
	}),
);
server.registerTool(
	"slow",
	{ description: "Sleeps", inputSchema: {} },
	async () => {
		await new Promise((r) => setTimeout(r, 5000));
		return { content: [{ type: "text", text: "late" }] };
	},
);
server.registerTool(
	"crash",
	{ description: "Kills the process", inputSchema: {} },
	async () => {
		process.exit(1);
	},
);
await server.connect(new StdioServerTransport());
