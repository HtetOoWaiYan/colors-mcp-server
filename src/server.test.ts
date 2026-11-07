import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { INSTRUCTIONS } from "./steering/register.js";

const EXPECTED_TOOLS = [
	"colors_check",
	"colors_fix",
	"colors_palette",
	"colors_find",
	"colors_scrim",
	"colors_audit",
	"colors_info",
	"colors_convert",
	"colors_compare",
	"colors_blend",
	"colors_adjust",
	"colors_harmony",
	"colors_vision",
];

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	while (closers.length) await closers.pop()?.();
});

describe("2025-era client (initialize handshake)", () => {
	async function connect() {
		const server = createServer();
		const client = new Client({ name: "test", version: "0.0.0" });
		const [c, s] = InMemoryTransport.createLinkedPair();
		await Promise.all([server.connect(s), client.connect(c)]);
		closers.push(async () => {
			await client.close();
			await server.close();
		});
		return client;
	}

	it("lists every tool in a stable order with annotations", async () => {
		const client = await connect();
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name)).toEqual(EXPECTED_TOOLS);
		for (const t of tools) {
			expect(t.annotations?.readOnlyHint).toBe(true);
			expect(t.inputSchema.type).toBe("object");
		}
	});

	it("calls a tool and returns text content", async () => {
		const client = await connect();
		const res = await client.callTool({
			name: "colors_convert",
			arguments: { colors: ["#3b82f6"], to: "rgb" },
		});
		expect(res.isError).toBeFalsy();
		expect(JSON.stringify(res.content)).toContain("rgb(59 130 246)");
		expect(res.structuredContent).toMatchObject({ to: "rgb" });
	});

	it("reports invalid arguments as a tool error the model can read", async () => {
		const client = await connect();
		const res = await client.callTool({
			name: "colors_convert",
			arguments: { colors: ["#3b82f6"], to: "notaspace" },
		});
		expect(res.isError).toBe(true);
		expect(JSON.stringify(res.content)).toMatch(/invalid arguments/i);
	});
});

describe("2026-07-28 client (stateless, server/discover)", () => {
	const META = {
		"io.modelcontextprotocol/protocolVersion": "2026-07-28",
		"io.modelcontextprotocol/clientCapabilities": {},
		"io.modelcontextprotocol/clientInfo": { name: "test", version: "0.0.0" },
	};

	async function rpc(method: string, params: Record<string, unknown> = {}) {
		const [a, b] = InMemoryTransport.createLinkedPair();
		const handle = serveStdio(createServer, { transport: b });
		closers.push(() => handle.close());
		const reply = new Promise<Record<string, unknown>>((resolve) => {
			a.onmessage = (m) => resolve(m as Record<string, unknown>);
		});
		await a.start();
		await a.send({
			jsonrpc: "2.0",
			id: 1,
			method,
			params: { ...params, _meta: META },
		});
		return reply;
	}

	it("answers server/discover with capabilities, instructions, cache hints and resultType", async () => {
		const msg = await rpc("server/discover");
		const result = msg.result as Record<string, unknown>;
		expect(result.resultType).toBe("complete");
		expect(result.supportedVersions).toContain("2026-07-28");
		for (const c of ["tools", "resources", "prompts"])
			expect(result.capabilities).toHaveProperty(c);
		expect(result.instructions).toBe(INSTRUCTIONS);
		expect(result.ttlMs).toBe(3_600_000);
		expect(result.cacheScope).toBe("public");
	});

	it("lists tools with resultType and cache hints, in stable order", async () => {
		const msg = await rpc("tools/list");
		const result = msg.result as {
			tools: { name: string }[];
			resultType: string;
			ttlMs: number;
			cacheScope: string;
		};
		expect(result.resultType).toBe("complete");
		expect(result.ttlMs).toBe(3_600_000);
		expect(result.cacheScope).toBe("public");
		expect(result.tools.map((t) => t.name)).toEqual(EXPECTED_TOOLS);
	});

	it("calls a tool statelessly", async () => {
		const msg = await rpc("tools/call", {
			name: "colors_check",
			arguments: { foreground: "#767676", background: "#ffffff" },
		});
		const result = msg.result as {
			resultType: string;
			content: { text: string }[];
		};
		expect(result.resultType).toBe("complete");
		expect(result.content[0]?.text).toMatch(/^PASS: 4\.54:1/);
	});

	it("rejects an unknown tool with a JSON-RPC invalid-params error", async () => {
		const msg = await rpc("tools/call", { name: "nope", arguments: {} });
		expect((msg.error as { code: number }).code).toBe(-32602);
	});
});
