import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMatrix } from "./matrix.js";
import { ResultStore, spendHoldout } from "./record.js";
import type { Provider, TurnResult } from "./runner/types.js";
import { loadSuite } from "./tasks/load.js";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "sealing-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const fresh = loadSuite("fresh");
// Answers each task with its witness, so the cells pass and a leak of "pass" would show in the log.
const witnessProvider = (byPrompt: Map<string, unknown>): Provider => ({
	id: "p",
	chat: async (req): Promise<TurnResult> => {
		const prompt = JSON.stringify(req);
		const hit = [...byPrompt.entries()].find(([p]) => prompt.includes(JSON.stringify(p).slice(1, 60)));
		return {
			text: `\`\`\`json\n${JSON.stringify(hit?.[1] ?? {})}\n\`\`\``,
			toolCalls: [],
			stop: "end",
			inputTokens: 1,
			outputTokens: 1,
			model: "fake",
		};
	},
});

const files = (root: string): string[] =>
	existsSync(root)
		? readdirSync(root, { withFileTypes: true, recursive: true })
				.filter((e) => e.isFile())
				.map((e) => join(e.parentPath, e.name))
		: [];

describe("fresh suite sealing path", () => {
	it("writes every cell to the sealed dir, none to results, and logs no per-task outcome", async () => {
		const tasks = fresh.tasks.slice(0, 3);
		const results = join(dir, "results");
		const sealed = join(dir, "sealed");
		const store = new ResultStore(results, sealed, "run-f");
		const lines: string[] = [];
		const s = await runMatrix({
			store,
			models: [
				{
					id: "m",
					modelName: "fake-model",
					provider: witnessProvider(new Map(tasks.map((t) => [t.prompt, t.witness]))),
				},
			],
			conditions: [{ name: "no-tools" }],
			tasks,
			taskHashes: fresh.manifest.tasks,
			graderHash: fresh.graderHash,
			trials: 2,
			log: (l) => lines.push(l),
		});
		expect(s).toMatchObject({ ran: 6, pending: 0 });
		expect(files(join(results, "run-f"))).toEqual([]);
		expect(files(join(sealed, "run-f", "cells"))).toHaveLength(6);
		expect(store.all(true).filter((c) => c.outcome === "pass")).toHaveLength(6);
		expect(lines).toHaveLength(6);
		for (const l of lines) expect(l).not.toMatch(/pass|failure|exhausted/);
	});

	it("a completed fresh matrix spends one held-out evaluation in the holdout log; an incomplete one does not", () => {
		const results = join(dir, "results");
		const entry = { runId: "run-f", suite: fresh.name, serverSha: "abc", profile: "tni", at: "t" };
		expect(spendHoldout(results, fresh.heldout, false, entry)).toBe(false);
		expect(existsSync(join(results, "holdout-log.jsonl"))).toBe(false);
		expect(spendHoldout(results, fresh.heldout, true, entry)).toBe(true);
		expect(spendHoldout(results, fresh.heldout, true, { ...entry, runId: "run-g" })).toBe(true);
		const log = readFileSync(join(results, "holdout-log.jsonl"), "utf8").trim().split("\n");
		expect(log.map((l) => JSON.parse(l))).toEqual([entry, { ...entry, runId: "run-g" }]);
	});

	it("the dev-only generalization suite never touches the holdout log", () => {
		const gen = loadSuite("generalization");
		const results = join(dir, "results");
		const entry = { runId: "g", suite: gen.name, serverSha: "abc", profile: "tni", at: "t" };
		expect(spendHoldout(results, gen.heldout, true, entry)).toBe(false);
		expect(existsSync(join(results, "holdout-log.jsonl"))).toBe(false);
	});
});
