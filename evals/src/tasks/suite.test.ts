import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { grade } from "../graders/index.js";
import { auditCss } from "../reference/audit.js";
import { manifestFor } from "./build-suite.js";
import { loadSuite } from "./load.js";

const { tasks, manifest } = loadSuite();
const ajv = new Ajv({ strict: false });

describe("suite structure", () => {
	it("has 14 categories x 4 tasks (3 dev + 1 held-out)", () => {
		expect(tasks).toHaveLength(56);
		for (let c = 1; c <= 14; c++) {
			const inCat = tasks.filter((t) => t.category === c);
			expect(inCat, `category ${c}`).toHaveLength(4);
			expect(inCat.filter((t) => t.split === "dev")).toHaveLength(3);
			expect(inCat.filter((t) => t.split === "heldout")).toHaveLength(1);
		}
		expect(tasks.filter((t) => t.split === "dev")).toHaveLength(42);
		expect(new Set(tasks.map((t) => t.id)).size).toBe(56);
	});
	it("matches its manifest, including the per-task hashes that key resume", () => {
		expect(manifestFor(tasks, manifest.version)).toEqual(manifest);
	});
	it("prompts leak no tool names or hints", () => {
		for (const t of tasks) {
			expect(t.prompt, t.id).not.toMatch(/colors?_[a-z]+|tool|mcp|server/i);
		}
	});
});

describe("witness rule: every task is feasible and every invalid answer fails", () => {
	for (const t of tasks) {
		it(`${t.id} ${t.categoryName}`, () => {
			const checks = grade(t.grader, t.witness);
			const failed = checks.filter((c) => !c.pass).map((c) => c.name);
			expect(failed, "witness failures").toEqual([]);
			expect(checks.length).toBeGreaterThan(0);
			expect(t.invalid.length).toBeGreaterThanOrEqual(2);
			for (const [i, bad] of t.invalid.entries()) {
				const r = grade(t.grader, bad);
				expect(
					r.every((c) => c.pass),
					`invalid[${i}] must fail`,
				).toBe(false);
			}
			// strict scoring needs a schema-valid answer, so a feasible task's witness must be one
			expect(
				ajv.validate(t.schema, t.witness),
				JSON.stringify(ajv.errors),
			).toBe(true);
		});
	}
});

describe("graders are total (never throw on garbage)", () => {
	const junk = [
		null,
		undefined,
		42,
		"text",
		[],
		{},
		{ results: "x" },
		{ hex: 5 },
		{ steps: [1, 2] },
	];
	for (const t of tasks) {
		it(t.id, () => {
			for (const j of junk) {
				const checks = grade(t.grader, j);
				expect(checks.length).toBeGreaterThan(0);
			}
		});
	}
});

describe("task-specific design constraints", () => {
	it("contrast-fix tasks have a finite d* (feasible)", () => {
		for (const t of tasks.filter((x) => x.grader.kind === "fix")) {
			expect(Number.isFinite(t.grader.params.dStar), t.id).toBe(true);
		}
	});
	it("verdict items keep a margin from their threshold", () => {
		for (const t of tasks.filter((x) => x.grader.kind === "verdict")) {
			for (const it of t.grader.params.items)
				expect(Math.abs(it.ratio - it.threshold)).toBeGreaterThan(0.005);
		}
	});
	it("audit tasks: one has zero findings; the rest have at least one", () => {
		const audits = tasks.filter((x) => x.grader.kind === "audit");
		const counts = audits.map((t) => t.grader.params.expected.length);
		expect(counts.filter((c) => c === 0)).toHaveLength(1);
	});
	it("audit expected matches the reference auditor on the prompt CSS", () => {
		for (const t of tasks.filter((x) => x.grader.kind === "audit")) {
			const css = /```css\n([\s\S]*?)\n```/.exec(t.prompt)?.[1] as string;
			expect(auditCss(css)).toEqual(t.grader.params.expected);
		}
	});
});
