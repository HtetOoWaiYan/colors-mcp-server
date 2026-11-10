import { existsSync, readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { gradeNeutral } from "../../graders-neutral/index.js";
import { CATEGORY_NAMES } from "../types.js";
import {
	buildAllNeutral,
	MANIFEST_NEUTRAL_PATH,
	neutralManifestFor,
	SUITE_NEUTRAL_PATH,
} from "./build-neutral.js";

const tasks = buildAllNeutral();
const ajv = new Ajv({ strict: false });
const failed = (t: (typeof tasks)[number], a: unknown) =>
	gradeNeutral(t.grader, a).filter((c) => !c.pass).length;

// A prompt may name standards (WCAG 2.x, APCA-W3, CSS Color 4, Machado 2009) but never anything about tools, servers or libraries.
const BANNED = /\b(tools?|mcp|servers?|plugins?|librar(y|ies)|npm|packages?|api|colorjs|culori|chroma-js|colorizr)\b/i;

describe("neutral suite structure", () => {
	it("has 12 categories of 5 tasks, all dev, unique ids, expected numbering", () => {
		expect(tasks).toHaveLength(60);
		expect(new Set(tasks.map((t) => t.id)).size).toBe(60);
		for (let c = 301; c <= 312; c++) {
			const ts = tasks.filter((t) => t.category === c);
			expect(ts, `category ${c}`).toHaveLength(5);
			ts.forEach((t, i) => {
				expect(t.id).toBe(`n${c}-${i + 1}`);
				expect(t.categoryName).toBe(CATEGORY_NAMES[c]);
			});
		}
		expect(tasks.every((t) => t.split === "dev")).toBe(true);
	});

	it("every grader kind is a neutral kind", () => {
		for (const t of tasks) expect(t.grader.kind, t.id).toMatch(/^neutral-/);
	});

	it("prompts are tool-agnostic and carry an output contract", () => {
		for (const t of tasks) {
			expect(t.prompt, t.id).not.toMatch(BANNED);
			expect(t.prompt, t.id).toMatch(/JSON/);
			expect(t.prompt.length, t.id).toBeGreaterThan(150);
		}
	});

	it("each task's schema accepts its witness", () => {
		for (const t of tasks) {
			const ok = ajv.validate(t.schema, t.witness);
			expect(ok, `${t.id}: ${ajv.errorsText()}`).toBe(true);
		}
	});

	it("the witness passes every check; at least two distinct invalid answers each fail a check", () => {
		for (const t of tasks) {
			const checks = gradeNeutral(t.grader, t.witness);
			expect(checks.length, t.id).toBeGreaterThan(1);
			expect(
				checks.filter((c) => !c.pass).map((c) => c.name),
				`${t.id} witness`,
			).toEqual([]);
			expect(t.invalid.length, t.id).toBeGreaterThanOrEqual(2);
			t.invalid.forEach((j, i) =>
				expect(failed(t, j), `${t.id} invalid[${i}]`).toBeGreaterThan(0),
			);
		}
	});

	it("graders never throw on junk input", () => {
		for (const t of tasks)
			for (const junk of [null, undefined, 42, "x", [], {}, [[]], { a: 1 }])
				expect(() => gradeNeutral(t.grader, junk), t.id).not.toThrow();
	});

	it("tasks are deterministic: building twice gives identical JSON", () => {
		expect(JSON.stringify(buildAllNeutral())).toBe(JSON.stringify(tasks));
	});
});

describe.runIf(existsSync(SUITE_NEUTRAL_PATH))("frozen neutral suite", () => {
	it("the frozen JSON and manifest match what the build produces", () => {
		const frozen = JSON.parse(readFileSync(SUITE_NEUTRAL_PATH, "utf8"));
		expect(frozen).toEqual(JSON.parse(JSON.stringify(tasks)));
		const m = JSON.parse(readFileSync(MANIFEST_NEUTRAL_PATH, "utf8"));
		expect(neutralManifestFor(tasks, m.version).suiteHash).toBe(m.suiteHash);
	});
});
