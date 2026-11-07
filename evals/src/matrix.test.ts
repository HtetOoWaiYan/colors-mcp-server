import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { graderHash } from "./identity.js";
import { type ModelSpec, runMatrix } from "./matrix.js";
import { ResultStore } from "./record.js";
import {
	type Provider,
	ProviderError,
	type TurnResult,
} from "./runner/types.js";
import { loadSuite } from "./tasks/load.js";
import type { Task } from "./tasks/types.js";

const task = (id: string, split: "dev" | "heldout" = "dev"): Task => ({
	id,
	category: 14,
	categoryName: "trap",
	split,
	prompt: `prompt ${id}`,
	schema: { type: "object" },
	grader: { kind: "trap", params: { mode: "string", expected: "yes" } },
	witness: { answer: "yes" },
	invalid: [{}, { answer: "no" }],
	toolUseful: false,
});

const reply = (answer: string): TurnResult => ({
	text: `\`\`\`json\n{"answer": "${answer}"}\n\`\`\``,
	toolCalls: [],
	stop: "end",
	inputTokens: 1,
	outputTokens: 1,
	model: "fake",
});

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "matrix-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const mk = (provider: Provider): ModelSpec => ({
	id: "m",
	modelName: "fake-model",
	provider,
});
const opts = (
	store: ResultStore,
	tasks: Task[],
	provider: Provider,
	extra: Partial<Parameters<typeof runMatrix>[0]> = {},
) => ({
	store,
	models: [mk(provider)],
	conditions: [{ name: "no-tools" }],
	tasks,
	taskHashes: Object.fromEntries(tasks.map((t) => [t.id, `hash-${t.prompt}`])),
	trials: 2,
	...extra,
});

describe("matrix", () => {
	it("runs every cell, grades, and writes held-out cells to the sealed dir only", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		const tasks = [task("a"), task("h", "heldout")];
		const s = await runMatrix(
			opts(store, tasks, { id: "p", chat: async () => reply("yes") }),
		);
		expect(s).toMatchObject({ ran: 4, skipped: 0, pending: 0 });
		expect(store.all(false).map((c) => c.taskId)).toEqual(["a", "a"]);
		expect(store.all(true)).toHaveLength(4);
		expect(store.all(true).every((c) => c.outcome === "pass")).toBe(true);
	});

	it("resumes without repeating finished cells", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		let calls = 0;
		const p: Provider = { id: "p", chat: async () => (calls++, reply("yes")) };
		await runMatrix(opts(store, [task("a")], p));
		expect(calls).toBe(2);
		const s2 = await runMatrix(opts(store, [task("a")], p));
		expect(calls).toBe(2);
		expect(s2).toMatchObject({ ran: 0, skipped: 2 });
	});

	it("does not reuse results when the task hash (prompt/grader inputs) changes", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		let calls = 0;
		const p: Provider = { id: "p", chat: async () => (calls++, reply("yes")) };
		await runMatrix(opts(store, [task("a")], p));
		const changed = opts(store, [task("a")], p, {
			taskHashes: { a: "different" },
		});
		await runMatrix(changed);
		expect(calls).toBe(4);
	});

	it("stops on 429, leaves the cell pending, and does not loop", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		let calls = 0;
		const p: Provider = {
			id: "p",
			chat: async () => {
				calls++;
				if (calls === 2) throw new ProviderError("rate_limit", "429");
				return reply("yes");
			},
		};
		const s = await runMatrix(opts(store, [task("a"), task("b")], p));
		expect(s.stoppedBy).toBe("rate_limit");
		expect(calls).toBe(2);
		expect(store.all(true)).toHaveLength(1);
		const s2 = await runMatrix(
			opts(store, [task("a"), task("b")], {
				id: "p",
				chat: async () => reply("yes"),
			}),
		);
		expect(s2.stoppedBy).toBeUndefined();
		expect(store.all(true)).toHaveLength(4);
	});

	it("re-queues infra failures up to 2 times, then records infra_failed", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		let calls = 0;
		const p: Provider = {
			id: "p",
			chat: async () => (
				calls++, Promise.reject(new ProviderError("infra", "503"))
			),
		};
		const s = await runMatrix(opts(store, [task("a")], p, { trials: 1 }));
		expect(calls).toBe(3);
		expect(s.infraFailed).toBe(1);
		expect(store.all(true)[0]).toMatchObject({
			status: "infra_failed",
			attempts: 3,
		});
		await runMatrix(opts(store, [task("a")], p, { trials: 1 }));
		expect(calls).toBe(3); // exhausted attempts are not retried on resume
	});

	it("recovers from an infra failure on re-queue", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		let calls = 0;
		const p: Provider = {
			id: "p",
			chat: async () =>
				++calls === 1
					? Promise.reject(new ProviderError("infra", "503"))
					: reply("yes"),
		};
		const s = await runMatrix(opts(store, [task("a")], p, { trials: 1 }));
		expect(s).toMatchObject({ ran: 1, infraFailed: 0 });
	});

	it("classifies outcomes: format failure, semantic failure, pass", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		const seq = [
			{ ...reply("yes"), text: "no json here" },
			reply("no"),
			reply("yes"),
		];
		let i = 0;
		await runMatrix(
			opts(
				store,
				[task("a")],
				{ id: "p", chat: async () => seq[i++] as TurnResult },
				{ trials: 3 },
			),
		);
		const outcomes = store
			.all(true)
			.sort((x, y) => x.trial - y.trial)
			.map((c) => c.outcome);
		expect(outcomes).toEqual(["format_failure", "semantic_failure", "pass"]);
	});

	it("honors a stop request between cells", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		let n = 0;
		const s = await runMatrix(
			opts(
				store,
				[task("a"), task("b")],
				{ id: "p", chat: async () => reply("yes") },
				{ shouldStop: () => n++ >= 1 },
			),
		);
		expect(s.stoppedBy).toBe("interrupt");
		expect(store.all(true)).toHaveLength(1);
	});

	it("resetRunning returns interrupted cells to pending", () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		store.write({
			id: "x",
			key: "k",
			status: "running",
			model: "m",
			condition: "no-tools",
			taskId: "a",
			trial: 1,
			split: "dev",
			category: 14,
			attempts: 1,
		});
		expect(store.resetRunning()).toBe(1);
		expect(store.all(true)).toHaveLength(0);
	});

	it("does not reuse results across client profiles", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		let calls = 0;
		const p: Provider = { id: "p", chat: async () => (calls++, reply("yes")) };
		await runMatrix(opts(store, [task("a")], p, { trials: 1 }));
		await runMatrix(
			opts(store, [task("a")], p, { trials: 1, profile: "instructions" }),
		);
		expect(calls).toBe(2);
	});

	it("keys cells by the suite's grader hash, defaulting to v1's", async () => {
		const store = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"r1",
		);
		let calls = 0;
		const p: Provider = { id: "p", chat: async () => (calls++, reply("yes")) };
		await runMatrix(opts(store, [task("a")], p, { trials: 1 }));
		await runMatrix(
			opts(store, [task("a")], p, { trials: 1, graderHash: graderHash() }),
		);
		expect(calls).toBe(1);
		await runMatrix(
			opts(store, [task("a")], p, {
				trials: 1,
				graderHash: loadSuite("generalization").graderHash,
			}),
		);
		expect(calls).toBe(2);
	});

	it("imports finished cells of one condition from another run and skips them", async () => {
		const a = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"base",
		);
		let calls = 0;
		const p: Provider = { id: "p", chat: async () => (calls++, reply("yes")) };
		await runMatrix(
			opts(a, [task("a"), task("h", "heldout")], p, { trials: 1 }),
		);
		expect(calls).toBe(2);
		const b = new ResultStore(
			join(dir, "results"),
			join(dir, "sealed"),
			"next",
		);
		expect(b.importCondition(a, "no-tools")).toBe(2);
		const s = await runMatrix(
			opts(b, [task("a"), task("h", "heldout")], p, { trials: 1 }),
		);
		expect(calls).toBe(2);
		expect(s.skipped).toBe(2);
	});
});
