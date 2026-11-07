import { describe, expect, it } from "vitest";
import type { CellRecord, Outcome } from "./record.js";
import {
	computeReport,
	computeSealedReport,
	renderMarkdown,
	renderSealedMarkdown,
} from "./report.js";
import { loadSuite } from "./tasks/load.js";
import type { Task } from "./tasks/types.js";

const task = (id: string, split: "dev" | "heldout", category = 14): Task => ({
	id,
	category,
	categoryName: "trap",
	split,
	prompt: "",
	schema: {},
	grader: { kind: "trap", params: {} },
	witness: {},
	invalid: [],
	toolUseful: true,
});
const SERVER = "server@abc";
const cell = (
	model: string,
	condition: string,
	t: Task,
	trial: number,
	outcome: Outcome,
	extra: Partial<CellRecord> = {},
): CellRecord => ({
	id: `${model}/${condition}/${t.id}/t${trial}`,
	key: "k",
	status: outcome === "infra_failed" ? "infra_failed" : "done",
	model,
	condition,
	taskId: t.id,
	trial,
	split: t.split,
	category: t.category,
	attempts: 1,
	outcome,
	checkScore: outcome === "pass" ? 1 : 0.5,
	...extra,
});

const tasks = [
	task("a", "dev"),
	task("b", "dev"),
	task("c", "dev"),
	task("h", "heldout"),
];
const base = {
	runId: "r",
	suiteVersion: 1,
	tasks,
	models: ["m"],
	conditions: ["no-tools", SERVER],
	serverCondition: SERVER,
};

describe("computeReport", () => {
	it("computes paired differences with task as the unit", () => {
		const cells: CellRecord[] = [];
		for (const t of tasks)
			for (const trial of [1, 2]) {
				cells.push(cell("m", "no-tools", t, trial, "semantic_failure"));
				cells.push(
					cell(
						"m",
						SERVER,
						t,
						trial,
						t.id === "c" ? "semantic_failure" : "pass",
					),
				);
			}
		const r = computeReport({ ...base, cells });
		expect(r.paired.dev.m?.mean).toBeCloseTo(2 / 3, 9);
		expect(r.dev.m?.[SERVER]?.pass).toBeCloseTo(2 / 3, 9);
		expect(r.dev.m?.["no-tools"]?.pass).toBe(0);
		expect(r.paired.heldout.m?.mean).toBe(1);
		expect(r.regressions).toEqual([]);
	});

	it("drops a trial pairwise when either condition failed on infrastructure", () => {
		const cells = [
			cell("m", "no-tools", tasks[0] as Task, 1, "pass"),
			cell("m", SERVER, tasks[0] as Task, 1, "infra_failed"),
			cell("m", "no-tools", tasks[0] as Task, 2, "pass"),
			cell("m", SERVER, tasks[0] as Task, 2, "pass"),
		];
		const r = computeReport({ ...base, cells });
		expect(r.dropped.m).toEqual({ trials: 1, total: 2, incomplete: true });
		expect(r.dev.m?.["no-tools"]?.trials).toBe(1);
	});

	it("lists regressions with transcript ids", () => {
		const t = tasks[0] as Task;
		const cells = [
			cell("m", "no-tools", t, 1, "pass"),
			cell("m", SERVER, t, 1, "semantic_failure"),
		];
		const r = computeReport({ ...base, cells });
		expect(r.regressions).toEqual([
			{
				model: "m",
				taskId: "a",
				serverPass: 0,
				baselinePass: 1,
				transcripts: ["m/server@abc/a/t1"],
			},
		]);
	});

	it("renders markdown without per-task held-out information", () => {
		// a held-out regression and failure would name this cell if the dev-only filters slipped
		const cells = [
			cell("m", "no-tools", tasks[3] as Task, 1, "pass"),
			cell("m", SERVER, tasks[3] as Task, 1, "semantic_failure"),
		];
		const md = renderMarkdown(computeReport({ ...base, cells }), {});
		expect(md).toContain("Held-out split (sealed)");
		expect(md).not.toContain("m/server@abc/h/t1");
	});

	it("a dev-only suite names itself, reports its own categories and claims no held-out comparison", () => {
		const gen = [task("g1", "dev", 101), task("g2", "dev", 105)];
		const cells = gen.flatMap((t) => [
			cell("m", "no-tools", t, 1, "semantic_failure"),
			cell("m", SERVER, t, 1, "pass"),
		]);
		const r = computeReport({
			...base,
			tasks: gen,
			cells,
			suite: { name: "generalization", heldout: false },
		});
		expect(r.categories).toEqual([101, 105]);
		expect(r.perCategoryDev.m?.[SERVER]).toEqual({ 101: 1, 105: 1 });
		expect(r.bar.meetsBar).toBeNull();
		const md = renderMarkdown(r, {});
		expect(md).toContain("Suite: generalization, version 1.");
		expect(md).toContain("no held-out comparison");
		expect(md).not.toContain("Held-out split (sealed)");
		expect(md).not.toContain("Predeclared bar");
		expect(md).toContain("| 101 |");
	});
});

describe("sealed-only suite (fresh)", () => {
	const fresh = loadSuite("fresh");
	// Real ids and categories, mixed outcomes and tool calls, so any per-task leak would carry a recognisable id.
	const cells = fresh.tasks.flatMap((t, i) =>
		[1, 2].flatMap((trial) => [
			cell("m", "no-tools", t, trial, i % 3 === 0 ? "pass" : "semantic_failure"),
			cell("m", SERVER, t, trial, i % 2 === 0 ? "pass" : "limit_exhausted", {
				run: {
					toolCalls: [{ name: "x" }],
					inputTokens: 100,
					outputTokens: 10,
					elapsedMs: 1,
				} as unknown as CellRecord["run"],
			}),
		]),
	);
	const r = computeSealedReport({
		...base,
		tasks: fresh.tasks,
		cells,
		suite: { name: "fresh", heldout: true, sealedOnly: true },
	});
	const md = renderSealedMarkdown(r, {});
	const json = JSON.stringify(r);

	it("contains no task id, cell id or category, in the markdown or the JSON", () => {
		for (const t of fresh.tasks) {
			expect(md).not.toContain(t.id);
			expect(json).not.toContain(t.id);
		}
		expect(md).not.toMatch(/^## (Per category|Regressions|Outcomes|Tool usage|Failure)/m);
		expect(md).not.toMatch(/\|\s*20[1-8]\s*\|/);
		expect(json).not.toMatch(/categor|regression|failureSample|outcomes|toolUsage/);
	});

	it("reports whole-suite aggregates and the paired difference with its bootstrap interval", () => {
		const server = r.aggregates.m?.[SERVER];
		expect(server).toMatchObject({ tasks: 32, trials: 64, toolCalls: 1, inputTokens: 100 });
		expect(server?.pass).toBeCloseTo(16 / 32, 9);
		// per task: server passes on even indexes, baseline on multiples of 3
		const diffs = fresh.tasks.map((_, i) => (i % 2 === 0 ? 1 : 0) - (i % 3 === 0 ? 1 : 0));
		expect(r.paired.m?.mean).toBeCloseTo(diffs.reduce((a, b) => a + b, 0) / 32, 9);
		expect(r.paired.pooled?.n).toBe(32);
		expect((r.paired.m?.lo ?? 1) <= (r.paired.m?.mean ?? 0)).toBe(true);
		expect(md).toContain("Task-clustered bootstrap 95% interval");
	});

	it("says in its header that the suite is sealed and was authored without sight of the tools or any results", () => {
		expect(md).toContain("Suite: fresh, version 1.");
		expect(md).toContain("**Sealed suite.**");
		expect(md).toContain("without sight of the tools or of any results");
	});
});
