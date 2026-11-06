import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { TOOLS } from "../tools/index.js";
import { GUIDE_TOPICS, GUIDES } from "./guides.js";
import { INSTRUCTIONS } from "./register.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	while (closers.length) await closers.pop()?.();
});

async function connect() {
	const server = createServer();
	const client = new Client({ name: "t", version: "0" });
	const [c, s] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(s), client.connect(c)]);
	closers.push(async () => {
		await client.close();
		await server.close();
	});
	return client;
}

describe("guides content", () => {
	it("each guide is non-trivial and names a tool", () => {
		for (const g of GUIDES) {
			expect(g.body.length, g.topic).toBeGreaterThan(600);
			expect(g.body, g.topic).toMatch(/colors_[a-z]+/);
		}
	});
	it("instructions advertise exactly the guide topics that exist", () => {
		expect(INSTRUCTIONS).toContain(`(${GUIDE_TOPICS.join(", ")})`);
	});
	it("guides and instructions only mention tools that exist", () => {
		const known = new Set(TOOLS.map((t) => t.name));
		const texts: [string, string][] = [
			["instructions", INSTRUCTIONS],
			...GUIDES.map((g): [string, string] => [g.topic, g.body]),
		];
		for (const [where, text] of texts) {
			for (const [name] of text.matchAll(/colors_[a-z]+/g))
				expect(known.has(name), `${where}: ${name}`).toBe(true);
		}
	});
	it("instructions stay short (under 200 words)", () => {
		expect(INSTRUCTIONS.split(/\s+/).length).toBeLessThan(200);
	});
});

describe("resources and prompts over MCP", () => {
	it("lists the index and one resource per guide", async () => {
		const c = await connect();
		const { resources } = await c.listResources();
		expect(
			resources.map((r) => r.uri).filter((u) => u.startsWith("colors://")),
		).toEqual([
			"colors://guide",
			"colors://guide/accessibility",
			"colors://guide/ui-design",
			"colors://guide/dataviz",
			"colors://guide/print",
			"colors://guide/film-video",
			"colors://guide/photo",
			"colors://guide/games",
			"colors://guide/social-brand",
		]);
	});
	it("reads a guide and the index", async () => {
		const c = await connect();
		const g = await c.readResource({ uri: "colors://guide/accessibility" });
		expect(JSON.stringify(g.contents)).toContain("4.5:1");
		const idx = await c.readResource({ uri: "colors://guide" });
		expect(JSON.stringify(idx.contents)).toContain("colors://guide/<topic>");
	});
	it("rejects an unknown guide and lists the real topics", async () => {
		const c = await connect();
		await expect(
			c.readResource({ uri: "colors://guide/nope" }),
		).rejects.toThrow(/Unknown guide "nope"\. Available: accessibility, /);
	});
	it("serves prompts with arguments", async () => {
		const c = await connect();
		const { prompts } = await c.listPrompts();
		expect(prompts.map((p) => p.name).sort()).toEqual([
			"brand-color-system",
			"fix-accessibility",
			"review-colors",
		]);
		const p = await c.getPrompt({
			name: "fix-accessibility",
			arguments: { pairs: "#777 on #fff" },
		});
		expect(JSON.stringify(p.messages)).toContain("colors_check");
		expect(JSON.stringify(p.messages)).toContain("#777 on #fff");
	});
	it("exposes the color-expert Agent Skill and advertises the skills extension", async () => {
		const c = await connect();
		const { resources } = await c.listResources();
		expect(resources.map((r) => r.uri)).toContain(
			"skill://color-expert/SKILL.md",
		);
		expect(c.getServerCapabilities()?.extensions).toHaveProperty(
			"io.modelcontextprotocol/skills",
		);
		const md = await c.readResource({ uri: "skill://color-expert/SKILL.md" });
		expect(JSON.stringify(md.contents)).toContain("name: color-expert");
	});
	it("sends instructions at initialize", async () => {
		const c = await connect();
		expect(c.getInstructions()).toBe(INSTRUCTIONS);
	});
});
