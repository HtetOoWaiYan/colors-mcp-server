import { describe, expect, it } from "vitest";
import type { CellRecord, Outcome } from "./record.js";
import { computeReport, renderMarkdown } from "./report.js";
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
});
