import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { createServer, VIEWER_URI } from "../server.js";
import { VIEWER_HTML } from "./viewer.generated.js";

describe("MCP Apps viewer", () => {
	it("is a single self-contained HTML document with no external references", () => {
		expect(VIEWER_HTML).toMatch(/^<!doctype html>/i);
		expect(VIEWER_HTML.length).toBeGreaterThan(1000);
		expect(VIEWER_HTML).not.toMatch(/(?:src|href)=["']https?:/i);
		expect(VIEWER_HTML).not.toMatch(/<script[^>]+src=/i);
	});

	it("serves the view with the MCP App MIME type and a locked-down CSP", async () => {
		const server = createServer();
		const client = new Client({ name: "t", version: "0" });
		const [c, s] = InMemoryTransport.createLinkedPair();
		await Promise.all([server.connect(s), client.connect(c)]);
		const { resources } = await client.listResources();
		expect(resources.find((r) => r.uri === VIEWER_URI)?.mimeType).toBe(
			"text/html;profile=mcp-app",
		);
		const read = await client.readResource({ uri: VIEWER_URI });
		const item = read.contents[0] as {
			mimeType: string;
			text: string;
			_meta?: { ui?: { csp?: unknown } };
		};
		expect(item.mimeType).toBe("text/html;profile=mcp-app");
		expect(item.text).toBe(VIEWER_HTML);
		expect(item._meta?.ui?.csp).toEqual({
			connectDomains: [],
			resourceDomains: [],
		});
		const { tools } = await client.listTools();
		for (const t of tools)
			expect(
				(t._meta as { ui?: { resourceUri?: string } }).ui?.resourceUri,
				t.name,
			).toBe(VIEWER_URI);
		await client.close();
		await server.close();
	});
});
