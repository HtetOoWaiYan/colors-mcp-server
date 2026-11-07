import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { gradeAny } from "../../graders-gen/index.js";
import { graderHash } from "../../identity.js";
import { hexToRgb, hueDiff, rgbToOklch } from "../../reference/color.js";
import {
	hexToRgb8,
	minScrimOpacity,
	mixLinear8,
	mixOklab8,
	mixSrgb8,
	over8,
	type Rgb8,
} from "../../reference-gen/composite.js";
import {
	decode709Limited,
	encode709Limited,
	encodeJfif,
} from "../../reference-gen/ycbcr.js";
import { loadSuite } from "../load.js";
import { buildAllGen, genManifestFor, MANIFEST_GEN_PATH } from "./build-gen.js";

const suite = loadSuite("generalization");
const { tasks } = suite;
const ajv = new Ajv({ strict: false });
const of = (kind: string) => tasks.filter((t) => t.grader.kind === kind);
const close = (a: readonly number[], b: readonly number[]) =>
	a.length === b.length && a.every((v, k) => Math.abs(v - (b[k] as number)) < 1e-6);

describe("generalization suite structure", () => {
	it("has 7 categories (101-107) x 4 tasks, all dev: nothing is tuned on, so nothing is sealed", () => {
		expect(tasks).toHaveLength(28);
		for (let c = 101; c <= 107; c++)
			expect(tasks.filter((t) => t.category === c), `category ${c}`).toHaveLength(4);
		expect(tasks.every((t) => t.split === "dev")).toBe(true);
		expect(suite.heldout).toBe(false);
		expect(new Set(tasks.map((t) => t.id)).size).toBe(28);
	});
	it("has at least 6 tasks where the tools give no direct help", () => {
		expect(tasks.filter((t) => !t.toolUseful).length).toBeGreaterThanOrEqual(6);
	});
	it("matches its manifest, including the per-task hashes that key resume", () => {
		const manifest = JSON.parse(readFileSync(MANIFEST_GEN_PATH, "utf8"));
		expect(genManifestFor(tasks, manifest.version)).toEqual(manifest);
	});
	it("the frozen JSON is exactly what the build produces (the build is deterministic)", () => {
		expect(JSON.parse(JSON.stringify(buildAllGen()))).toEqual(tasks);
	}, 180_000);
	it("prompts leak no tool names or hints", () => {
		const hint = /\bcolors?_[a-z_]+|tool|mcp|server|function call/i;
		for (const name of ["colors_check", "colors_palette", "color_mix"])
			expect(`try ${name} first`).toMatch(hint);
		for (const t of tasks) expect(t.prompt, t.id).not.toMatch(hint);
	});
});

describe("run identity is separate from v1", () => {
	const v1 = loadSuite("v1");
	it("v1 keeps the legacy grader hash; this suite's hash also covers its own graders", () => {
		expect(v1.graderHash).toBe(graderHash());
		expect(suite.graderHash).not.toBe(v1.graderHash);
	});
	it("task ids never collide with v1, so cells and resume keys cannot be confused", () => {
		const v1Ids = new Set(v1.tasks.map((t) => t.id));
		expect(tasks.filter((t) => v1Ids.has(t.id))).toEqual([]);
	});
});

describe("witness rule: every task is feasible and every invalid answer fails", () => {
	for (const t of tasks) {
		it(`${t.id} ${t.categoryName}`, () => {
			const checks = gradeAny(t.grader, t.witness);
			expect(checks.filter((c) => !c.pass).map((c) => c.name)).toEqual([]);
			expect(checks.length).toBeGreaterThan(0);
			expect(t.invalid.length).toBeGreaterThanOrEqual(3);
			for (const [i, bad] of t.invalid.entries())
				expect(
					gradeAny(t.grader, bad).every((c) => c.pass),
					`invalid[${i}] must fail`,
				).toBe(false);
			expect(ajv.validate(t.schema, t.witness), JSON.stringify(ajv.errors)).toBe(
				true,
			);
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
		{ hex: 5 },
		{ hex: "#ggg" },
		{ opacity: "0.5" },
		{ opacity: Number.NaN },
		{ results: "x" },
		{ results: [{ y: "a", hex: 3 }] },
		{ colors: [1, 2] },
		{ colors: "#ffffff" },
		{ steps: ["#fff"] },
		{ steps: [null, 1, {}, [], "x", true, 0] },
	];
	for (const t of tasks)
		it(t.id, () => {
			for (const j of junk)
				expect(gradeAny(t.grader, j).length).toBeGreaterThan(0);
		});
});

// Each grader rule must be stated in the prompt: expectations are re-derived from the prompt text, not copied from params.
describe("prompt states every rule the grader checks", () => {
	for (const t of of("gen-pick"))
		it(`${t.id} pick rules`, () => {
			const p = t.grader.params;
			const bullets = t.prompt.split("\n").filter((l) => l.startsWith("- "));
			// one stated requirement per check, valid_hex aside
			expect(bullets).toHaveLength(gradeAny(t.grader, t.witness).length - 1);
			expect(t.prompt).toContain(`chroma at least ${p.cMin}`);
			if (p.lMin !== undefined)
				expect(t.prompt).toContain(`lightness at least ${p.lMin}`);
			if (p.lMax !== undefined)
				expect(t.prompt).toContain(`lightness at most ${p.lMax}`);
			for (const c of p.contrasts) {
				expect(t.prompt).toContain(c.against);
				expect(t.prompt).toContain(`at least ${c.min}:1`);
			}
			const brand = /brand color (#[0-9a-f]{6})/.exec(t.prompt)?.[1];
			if (t.category === 103) {
				const tol = Number(/within (\d+) degrees/.exec(t.prompt)?.[1]);
				const h = rgbToOklch(hexToRgb(brand as string)).H;
				expect(hueDiff(p.hue.min, h - tol)).toBeLessThan(1e-3);
				expect(hueDiff(p.hue.max, h + tol)).toBeLessThan(1e-3);
			} else
				expect(t.prompt).toContain(
					`hue between ${p.hue.min} and ${p.hue.max} degrees`,
				);
		});

	for (const t of of("gen-scrim"))
		it(`${t.id} scrim optimum follows from the prompt`, () => {
			const text = /Text color: (#[0-9a-f]{6})/.exec(t.prompt)?.[1] as string;
			const overlay = /Overlay color: (#[0-9a-f]{6})/.exec(t.prompt)?.[1] as string;
			const regions = (
				/behind the text: ([^\n]+)\./.exec(t.prompt)?.[1] as string
			).split(", ");
			const target = Number(/at least ([\d.]+):1/.exec(t.prompt)?.[1]);
			const step = Number(/in steps of ([\d.]+)/.exec(t.prompt)?.[1]);
			expect(t.grader.params).toMatchObject({ text, scrim: overlay, regions, target, step });
			expect(minScrimOpacity(text, overlay, regions, target, step)).toBe(
				t.grader.params.alphaStar,
			);
		});

	const LAYER = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)|#([0-9a-f]{8}|[0-9a-f]{6})\b/g;
	const MIX =
		/^color-mix\(in (srgb|srgb-linear|oklab), (#[0-9a-f]{6})(?: (\d+)%)?, (#[0-9a-f]{6})\)$/;
	function fromLine(line: string): Rgb8 {
		const m = MIX.exec(line);
		if (m) {
			const fn = { srgb: mixSrgb8, "srgb-linear": mixLinear8, oklab: mixOklab8 }[
				m[1] as "srgb"
			];
			const pct = m[3] ? Number(m[3]) : 50;
			return fn(hexToRgb8(m[2] as string), hexToRgb8(m[4] as string), 1 - pct / 100);
		}
		const layers = [...line.matchAll(LAYER)].map((x) =>
			x[1]
				? { rgb: [x[1], x[2], x[3]].map(Number) as unknown as Rgb8, a: Number(x[4]) }
				: {
						rgb: hexToRgb8(`#${(x[5] as string).slice(0, 6)}`),
						a: x[5]?.length === 8 ? Number.parseInt(x[5].slice(6), 16) / 255 : 1,
					},
		);
		return layers.reduceRight<Rgb8>(
			(below, l) => over8(l.rgb, l.a, below),
			[0, 0, 0],
		);
	}
	for (const t of of("gen-mix"))
		it(`${t.id} expected colors follow from the prompt lines`, () => {
			const lines = [...t.prompt.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1] as string);
			expect(lines).toHaveLength(t.grader.params.items.length);
			lines.forEach((l, i) =>
				expect(close(fromLine(l), t.grader.params.items[i].expected), l).toBe(true),
			);
			expect(t.prompt).toContain("Round each final channel to the nearest integer");
		});

	for (const t of of("gen-grayscale"))
		it(`${t.id} grayscale rules`, () => {
			const p = t.grader.params;
			for (const s of [
				`by at least ${p.lGap}`,
				`at least ${p.minContrast}:1 against the background ${p.background}`,
				`chroma at least ${p.cMin}`,
				`at least ${p.hueGap} degrees apart`,
				`exactly ${p.n} colors`,
			])
				expect(t.prompt).toContain(s);
		});

	for (const t of of("gen-diverging"))
		it(`${t.id} diverging rules`, () => {
			const p = t.grader.params;
			for (const s of [
				`lightness at least ${p.centerLMin}, chroma at most ${p.centerCMax}`,
				`hue between ${p.hueA.min} and ${p.hueA.max} degrees, chroma at least ${p.sideCMin}`,
				`hue between ${p.hueB.min} and ${p.hueB.max} degrees, chroma at least ${p.sideCMin}`,
				`by at most ${p.symTol}`,
				`at least ${p.minStep} per step`,
				`lightness at most ${p.endLMax} and chroma at least ${p.endCMin}`,
				`is at least ${p.deutanMin}.`,
				"severity 1.0",
			])
				expect(t.prompt).toContain(s);
		});

	for (const t of of("gen-ycbcr"))
		it(`${t.id} expected code values follow from the prompt lines`, () => {
			const jfif = t.prompt.includes("JFIF");
			const lines = [...t.prompt.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1] as string);
			expect(lines).toHaveLength(t.grader.params.items.length);
			lines.forEach((l, i) => {
				const item = t.grader.params.items[i];
				const hex = /^#[0-9a-f]{6}$/.exec(l)?.[0];
				if (hex) {
					expect(item.kind).toBe("encode");
					const want = jfif ? encodeJfif(hex) : encode709Limited(hex);
					expect(close(want, item.expected)).toBe(true);
					return;
				}
				const [y, cb, cr] = (/Y' (\d+), Cb (\d+), Cr (\d+)/.exec(l) as RegExpExecArray)
					.slice(1)
					.map(Number) as [number, number, number];
				const rgb = decode709Limited(y, cb, cr);
				const clipped = rgb.map((v) => Math.min(255, Math.max(0, v * 255)));
				expect(close(clipped, item.expected)).toBe(true);
				if (item.kind === "legal")
					expect(item.legal).toBe(rgb.every((v) => v >= 0 && v <= 1));
			});
		});

	it("the legality task mixes legal and illegal samples", () => {
		const items = of("gen-ycbcr").flatMap((t) =>
			t.grader.params.items.filter((x: { kind: string }) => x.kind === "legal"),
		);
		expect(new Set(items.map((x: { legal: boolean }) => x.legal))).toEqual(
			new Set([true, false]),
		);
	});
});
