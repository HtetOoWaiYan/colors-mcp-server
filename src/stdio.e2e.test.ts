import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	while (closers.length) await closers.pop()?.();
});

async function start(mode: "legacy" | "auto") {
	const transport = new StdioClientTransport({
		command: `${root}node_modules/.bin/tsx`,
		args: ["src/index.ts"],
		cwd: root,
		stderr: "ignore",
	});
	const client = new Client(
		{ name: "e2e", version: "0.0.0" },
		{ versionNegotiation: { mode } },
	);
	await client.connect(transport);
	closers.push(() => client.close());
	return client;
}

describe("stdio end to end (real child process)", () => {
	it("serves a 2025-era client", async () => {
		const client = await start("legacy");
		expect(client.getProtocolEra()).toBe("legacy");
		const res = await client.callTool({
			name: "colors_info",
			arguments: { colors: ["tomato"] },
		});
		expect(JSON.stringify(res.content)).toContain("rgb(255 99 71)");
	}, 30_000);

	it("serves a 2026-07-28 client via server/discover", async () => {
		const client = await start("auto");
		expect(client.getProtocolEra()).toBe("modern");
		const { tools } = await client.listTools();
		expect(tools).toHaveLength(11);
	}, 30_000);
});
