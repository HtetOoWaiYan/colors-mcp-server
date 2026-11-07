import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { connectServer } from "./mcp-bridge.js";
import { type ToolHost, ToolHostCrash } from "./types.js";

const FAKE = fileURLToPath(
	new URL("./testing/fake-server.mjs", import.meta.url),
);
const cwd = fileURLToPath(new URL("../..", import.meta.url));
let host: ToolHost | undefined;
afterEach(async () => {
	await host?.close();
	host = undefined;
});

const start = async () => {
	host = await connectServer({ command: process.execPath, args: [FAKE], cwd });
	return host;
};

describe("mcp bridge (stdio, real SDK client)", () => {
	it("captures the negotiated protocol version instead of assuming it", async () => {
		const h = await start();
		expect(h.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("lists tools in provider-ready form", async () => {
		const h = await start();
		expect(h.tools.map((t) => t.name).sort()).toEqual([
			"crash",
			"echo",
			"fail",
			"slow",
		]);
		expect(h.tools.find((t) => t.name === "echo")?.inputSchema.type).toBe(
			"object",
		);
	});

	it("forwards only content text (TNI): structuredContent is dropped", async () => {
		const h = await start();
		const out = await h.call("echo", { text: "hi" }, 5000);
		expect(out).toMatchObject({ text: "echo:hi", isError: false });
		expect(out.text).not.toContain("hidden");
	});

	it("surfaces isError results and invalid arguments as tool errors", async () => {
		const h = await start();
		expect(await h.call("fail", {}, 5000)).toMatchObject({
			text: "nope",
			isError: true,
			schemaRejection: false,
		});
		const bad = await h.call("echo", { text: 5 }, 5000);
		expect(bad.isError).toBe(true);
		expect(bad.schemaRejection).toBe(true);
	});

	it("reports an unknown tool as an error rather than throwing", async () => {
		const h = await start();
		expect((await h.call("nope", {}, 5000)).isError).toBe(true);
	});

	it("times out slow calls as a tool error, not a crash", async () => {
		const h = await start();
		const out = await h.call("slow", {}, 300);
		expect(out).toMatchObject({ isError: true, timedOut: true });
	});

	it("treats a dying server as a crash", async () => {
		const h = await start();
		await expect(
			h.call("crash", {}, 5000).then(() => h.call("echo", { text: "x" }, 2000)),
		).rejects.toBeInstanceOf(ToolHostCrash);
	});

	it("fails clearly when the server cannot start", async () => {
		await expect(
			connectServer({
				command: process.execPath,
				args: ["/nonexistent.mjs"],
				cwd,
			}),
		).rejects.toThrow(/could not start/);
	});
});
