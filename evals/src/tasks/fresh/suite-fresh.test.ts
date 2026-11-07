import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { gradeEvery } from "../../graders-fresh/index.js";
import { gradeDiverging } from "../../graders-gen/tasks.js";
import { gradeDivergingN } from "../../graders-fresh/tasks.js";
import { graderHash } from "../../identity.js";
import { hexToRgb, hueDiff, rgbToOklch } from "../../reference/color.js";
import {
	gradientMinContrast,
	stopsMinContrast,
} from "../../reference-fresh/gradient.js";
import { decodeYcbcr, encodeYcbcr, type YcbcrSpec } from "../../reference-fresh/ycbcr.js";
import {
	hexToRgb8,
	minScrimOpacity,
	mixLinear8,
	mixOklab8,
	mixSrgb8,
	over8,
	type Rgb8,
} from "../../reference-gen/composite.js";
import { loadSuite } from "../load.js";
import { buildAllFresh, freshManifestFor, MANIFEST_FRESH_PATH } from "./build-fresh.js";

const suite = loadSuite("fresh");
const { tasks } = suite;
const ajv = new Ajv({ strict: false });
const of = (kind: string) => tasks.filter((t) => t.grader.kind === kind);
const failedNames = (spec: (typeof tasks)[number]["grader"], answer: unknown) =>
	gradeEvery(spec, answer)
		.filter((c) => !c.pass)
		.map((c) => c.name);
const close = (a: readonly number[], b: readonly number[]) =>
	a.length === b.length && a.every((v, k) => Math.abs(v - (b[k] as number)) < 1e-6);
const num = (re: RegExp, s: string) => {
	const m = re.exec(s);
	if (!m) throw new Error(`no match for ${re}`);
	return Number(m[1]);
};
const floor2 = (v: number) => Math.floor(v * 100 + 1e-9) / 100;

describe("fresh suite structure", () => {
	it("has 8 categories (201-208) x 4 tasks, every one held out, and the suite is sealed", () => {
		expect(tasks).toHaveLength(32);
		for (let c = 201; c <= 208; c++)
			expect(tasks.filter((t) => t.category === c), `category ${c}`).toHaveLength(4);
		expect(tasks.every((t) => t.split === "heldout")).toBe(true);
		expect(suite.heldout).toBe(true);
		expect(suite.sealedOnly).toBe(true);
		expect(new Set(tasks.map((t) => t.id)).size).toBe(32);
	});
	it("matches its manifest, including the per-task hashes that key resume", () => {
		const manifest = JSON.parse(readFileSync(MANIFEST_FRESH_PATH, "utf8"));
		expect(freshManifestFor(tasks, manifest.version)).toEqual(manifest);
	});
	it("the frozen JSON is exactly what the build produces (the build is deterministic)", () => {
		expect(JSON.parse(JSON.stringify(buildAllFresh()))).toEqual(tasks);
	}, 300_000);
	it("prompts leak no tool names or hints", () => {
		const hint = /\bcolou?rs?_[a-z0-9_]+|tool|mcp|server|function call/i;
		for (const name of ["colors_check", "colors_contrast_ratio", "color_mix", "an MCP call"])
			expect(`try ${name} first`).toMatch(hint);
		for (const t of tasks) expect(t.prompt, t.id).not.toMatch(hint);
	});
});

describe("run identity is separate from v1 and the generalization suite", () => {
	const v1 = loadSuite("v1");
	const gen = loadSuite("generalization");
	it("v1 keeps the legacy grader hash and each suite hashes a different set of sources", () => {
		expect(v1.graderHash).toBe(graderHash());
		expect(new Set([v1.graderHash, gen.graderHash, suite.graderHash]).size).toBe(3);
	});
	it("task ids never collide with the other suites, so cells and resume keys cannot be confused", () => {
		const other = new Set([...v1.tasks, ...gen.tasks].map((t) => t.id));
		expect(tasks.filter((t) => other.has(t.id))).toEqual([]);
	});
});

describe("witness rule: every task is feasible and every invalid answer fails", () => {
	for (const t of tasks) {
		it(`${t.id} ${t.categoryName}`, () => {
			const checks = gradeEvery(t.grader, t.witness);
			expect(checks.filter((c) => !c.pass).map((c) => c.name)).toEqual([]);
			expect(checks.length).toBeGreaterThan(0);
			expect(t.invalid.length).toBeGreaterThanOrEqual(3);
			const fails = t.invalid.map((bad) => failedNames(t.grader, bad));
			fails.forEach((f, i) => expect(f.length, `invalid[${i}] must fail`).toBeGreaterThan(0));
			// at least one borderline invalid breaks a single rule, so passing needs every rule, not most
			expect(fails.some((f) => f.length === 1)).toBe(true);
			expect(ajv.validate(t.schema, t.witness), JSON.stringify(ajv.errors)).toBe(true);
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
		{ hex: "#fff", extra: true },
		{ opacity: "0.5" },
		{ opacity: Number.NaN },
		{ results: "x" },
		{ results: [{ y: "a", hex: 3, legal: "yes" }] },
		{ colors: [1, 2] },
		{ colors: "#ffffff" },
		{ steps: ["#fff"] },
		{ steps: [null, 1, {}, [], "x", true, 0, "#000", "#fff"] },
	];
	for (const t of tasks)
		it(t.id, () => {
			for (const j of junk) expect(gradeEvery(t.grader, j).length).toBeGreaterThan(0);
		});
});

describe("searched floors sit at 0.6 of the best value meeting the other rules", () => {
	it("chroma, lightness-gap and deuteranopia floors", () => {
		for (const t of tasks) {
			const p = t.grader.params;
			const d = p.derivation;
			if (t.grader.kind === "gen-pick" || t.grader.kind === "fresh-gradient-text")
				expect(p.cMin, t.id).toBe(floor2(0.6 * d.openMaxChroma));
			if (t.grader.kind === "gen-grayscale") expect(p.lGap, t.id).toBe(floor2(0.6 * d.gStar));
			if (t.grader.kind === "fresh-diverging")
				expect(p.deutanMin, t.id).toBe(Math.floor(0.6 * d.bestDeutan));
		}
	});
});

// Each grader rule must be stated in the prompt: expectations are re-derived from the prompt text, not copied from params.
describe("prompt states every rule the grader checks", () => {
	const contrastLines = (prompt: string) =>
		prompt
			.split("\n")
			.filter(
				(l) =>
					l.startsWith("- ") &&
					l.toLowerCase().includes("contrast ratio of at least") &&
					!l.includes("every point of the gradient"),
			)
			.map((l) => ({
				against: (/(#[0-9a-f]{6})/.exec(l) as RegExpExecArray)[1],
				min: num(/at least (\d+(?:\.\d+)?):1/, l),
			}));
	const bandOf = (prompt: string) => ({
		min: num(/hue between (\d+) and \d+ degrees/, prompt),
		max: num(/hue between \d+ and (\d+) degrees/, prompt),
	});

	for (const t of of("gen-pick"))
		it(`${t.id} pick rules`, () => {
			const p = t.grader.params;
			const bullets = t.prompt.split("\n").filter((l) => l.startsWith("- "));
			// one stated requirement per check, valid_hex aside
			expect(bullets).toHaveLength(gradeEvery(t.grader, t.witness).length - 1);
			expect(p.cMin).toBe(num(/chroma at least (\d+(?:\.\d+)?)/, t.prompt));
			if (p.lMin !== undefined) expect(p.lMin).toBe(num(/lightness at least (\d+(?:\.\d+)?)/, t.prompt));
			if (p.lMax !== undefined) expect(p.lMax).toBe(num(/lightness at most (\d+(?:\.\d+)?)/, t.prompt));
			expect(p.contrasts.map(({ against, min }: { against: string; min: number }) => ({ against, min }))).toEqual(
				contrastLines(t.prompt),
			);
			if (t.category === 203) {
				const brand = /brand color (#[0-9a-f]{6})/.exec(t.prompt)?.[1] as string;
				const tol = num(/within (\d+) degrees/, t.prompt);
				const h = rgbToOklch(hexToRgb(brand)).H;
				expect(hueDiff(p.hue.min, h - tol)).toBeLessThan(1e-3);
				expect(hueDiff(p.hue.max, h + tol)).toBeLessThan(1e-3);
			} else expect(p.hue).toEqual(bandOf(t.prompt));
		});

	for (const t of of("gen-scrim"))
		it(`${t.id} scrim optimum follows from the prompt`, () => {
			const text = /Text color: (#[0-9a-f]{6})/.exec(t.prompt)?.[1] as string;
			const overlay = /Overlay color: (#[0-9a-f]{6})/.exec(t.prompt)?.[1] as string;
			const regions = (/behind the text: ([^\n]+?)\.\n/.exec(t.prompt)?.[1] as string).split(", ");
			const target = num(/at least (\d+(?:\.\d+)?):1/, t.prompt);
			const step = num(/in steps of (\d+(?:\.\d+)?)/, t.prompt);
			expect(t.grader.params).toMatchObject({ text, scrim: overlay, regions, target, step });
			expect(minScrimOpacity(text, overlay, regions, target, step)).toBe(t.grader.params.alphaStar);
		});

	const MIX =
		/^color-mix\(in (srgb|srgb-linear|oklab), (#[0-9a-f]{6})(?: (\d+)%)?, (#[0-9a-f]{6})(?: (\d+)%)?\)$/;
	function layer(tok: string): { rgb: Rgb8; a: number } {
		const r = /^rgba\((\d+), (\d+), (\d+), (\d+(?:\.\d+)?)\)$/.exec(tok);
		if (r) return { rgb: r.slice(1, 4).map(Number) as unknown as Rgb8, a: Number(r[4]) };
		const h = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(tok) as RegExpExecArray;
		return {
			rgb: hexToRgb8(`#${h[1]}`),
			a: h[2] ? Number.parseInt(h[2], 16) / 255 : 1,
		};
	}
	function fromLine(line: string): Rgb8 {
		const m = MIX.exec(line);
		if (m) {
			const fn = { srgb: mixSrgb8, "srgb-linear": mixLinear8, oklab: mixOklab8 }[m[1] as "srgb"];
			const shareB = m[3] ? 1 - Number(m[3]) / 100 : m[5] ? Number(m[5]) / 100 : 0.5;
			return fn(hexToRgb8(m[2] as string), hexToRgb8(m[4] as string), shareB);
		}
		// "top over ... over base"
		const layers = line.split(" over ").map((tok) => layer(tok.trim()));
		return layers.reduceRight<Rgb8>((below, l) => over8(l.rgb, l.a, below), [0, 0, 0]);
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
			const background = /against the background (#[0-9a-f]{6})/.exec(t.prompt)?.[1];
			expect(t.grader.params).toMatchObject({
				n: num(/exactly (\d+) colors/, t.prompt),
				lGap: num(/by at least (\d+(?:\.\d+)?)\./, t.prompt),
				minContrast: num(/at least (\d+(?:\.\d+)?):1 against the background/, t.prompt),
				background,
				cMin: num(/chroma at least (\d+(?:\.\d+)?)/, t.prompt),
				hueGap: num(/at least (\d+) degrees apart/, t.prompt),
			});
		});

	for (const t of of("fresh-diverging"))
		it(`${t.id} diverging rules`, () => {
			const s = t.prompt;
			const middle = /meeting at a (light|dark) neutral/.exec(s)?.[1];
			const bands = [...s.matchAll(/hue between (\d+) and (\d+) degrees/g)].map((m) => ({
				min: Number(m[1]),
				max: Number(m[2]),
			}));
			expect(t.grader.params).toMatchObject({
				n: num(/Build a (\d+)-step/, s),
				middle,
				centerL: num(/neutral: lightness at (?:least|most) (\d+(?:\.\d+)?)/, s),
				centerCMax: num(/neutral: lightness at (?:least|most) [\d.]+, chroma at most (\d+(?:\.\d+)?)/, s),
				sideCMin: num(/degrees[^.]*?, chroma at least (\d+(?:\.\d+)?)/, s),
				symTol: num(/by at most (\d+(?:\.\d+)?)/, s),
				minStep: num(/by at least (\d+(?:\.\d+)?) per step/, s),
				endL: num(/end colors have lightness at (?:least|most) (\d+(?:\.\d+)?)/, s),
				endCMin: num(/end colors have lightness at (?:least|most) [\d.]+ and chroma at least (\d+(?:\.\d+)?)/, s),
				deutanMin: num(/is at least (\d+(?:\.\d+)?)\.\n/, s),
				hueA: bands[0],
				hueB: bands[1],
			});
			// the stated direction must match the middle: a light middle has dark ends and vice versa
			const light = middle === "light";
			expect(s).toContain(light ? "rises toward the middle" : "falls toward the middle");
			expect(s).toContain(`neutral: lightness at ${light ? "least" : "most"}`);
			expect(s).toContain(`end colors have lightness at ${light ? "most" : "least"}`);
			expect(s).toContain("severity 1.0");
		});

	for (const t of of("gen-ycbcr"))
		it(`${t.id} expected code values follow from the prompt lines`, () => {
			const spec: YcbcrSpec = {
				kr: num(/Kr = (\d+(?:\.\d+)?)/, t.prompt),
				kb: num(/Kb = (\d+(?:\.\d+)?)/, t.prompt),
				bits: num(/(\d+)-bit (?:limited|full)/, t.prompt) as 8 | 10,
				range: /\d+-bit full range/.test(t.prompt) ? "full" : "limited",
			};
			const lines = [...t.prompt.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1] as string);
			expect(lines).toHaveLength(t.grader.params.items.length);
			lines.forEach((l, i) => {
				const item = t.grader.params.items[i];
				const hex = /^#[0-9a-f]{6}$/.exec(l)?.[0];
				if (hex) {
					expect(item.kind).toBe("encode");
					expect(close(encodeYcbcr(hex, spec), item.expected)).toBe(true);
					return;
				}
				const [y, cb, cr] = (/Y' (\d+), Cb (\d+), Cr (\d+)/.exec(l) as RegExpExecArray)
					.slice(1)
					.map(Number) as [number, number, number];
				const rgb = decodeYcbcr(y, cb, cr, spec);
				expect(close(rgb.map((v) => Math.min(255, Math.max(0, v * 255))), item.expected)).toBe(true);
				if (item.kind === "legal") expect(item.legal).toBe(rgb.every((v) => v >= 0 && v <= 1));
			});
		});

	it("the legality task mixes legal and illegal samples", () => {
		const items = of("gen-ycbcr").flatMap((t) =>
			t.grader.params.items.filter((x: { kind: string }) => x.kind === "legal"),
		);
		expect(new Set(items.map((x: { legal: boolean }) => x.legal))).toEqual(new Set([true, false]));
	});

	for (const t of of("fresh-gradient-text"))
		it(`${t.id} gradient rules`, () => {
			const p = t.grader.params;
			const css = /background: (.+);/.exec(t.prompt)?.[1] as string;
			expect(p.stops).toEqual([...css.matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0]));
			expect(p.target).toBe(num(/at least (\d+(?:\.\d+)?):1 against every point of the gradient/, t.prompt));
			expect(p.hue).toEqual(bandOf(t.prompt));
			expect(p.cMin).toBe(num(/chroma at least (\d+(?:\.\d+)?)/, t.prompt));
			expect(p.also.map(({ against, min }: { against: string; min: number }) => ({ against, min }))).toEqual(
				contrastLines(t.prompt),
			);
			expect(t.prompt).toContain("gamma-encoded sRGB");
			expect(t.prompt).toContain("blended colors are not rounded");
		});
});

describe("the gradient trap: colors that clear every stop but not the blend between them", () => {
	it("at least three gradient tasks carry such a borderline invalid, and it fails only the gradient rule", () => {
		let withTrap = 0;
		for (const t of of("fresh-gradient-text")) {
			const p = t.grader.params;
			const traps = t.invalid.filter((bad) => {
				const hex = (bad as { hex?: unknown }).hex;
				return (
					typeof hex === "string" &&
					/^#[0-9a-f]{6}$/.test(hex) &&
					stopsMinContrast(hex, p.stops) >= p.target &&
					gradientMinContrast(hex, p.stops) < p.target
				);
			});
			for (const bad of traps) expect(failedNames(t.grader, bad)).toEqual(["contrast_gradient"]);
			if (traps.length) withTrap++;
		}
		expect(withTrap).toBeGreaterThanOrEqual(3);
	});
});

describe("the N-step diverging grader agrees with the generalization suite's 7-step grader", () => {
	it("same verdict on every 7-step witness and invalid of the generalization suite", () => {
		for (const t of loadSuite("generalization").tasks.filter((x) => x.grader.kind === "gen-diverging")) {
			const g = t.grader.params;
			const p = {
				n: 7,
				middle: "light" as const,
				centerL: g.centerLMin,
				centerCMax: g.centerCMax,
				symTol: g.symTol,
				minStep: g.minStep,
				endL: g.endLMax,
				sideCMin: g.sideCMin,
				endCMin: g.endCMin,
				hueA: g.hueA,
				hueB: g.hueB,
				deutanMin: g.deutanMin,
			};
			for (const answer of [t.witness, ...t.invalid]) {
				const verdict = (cs: { pass: boolean }[]) => cs.map((c) => c.pass);
				expect(verdict(gradeDivergingN(answer, p))).toEqual(verdict(gradeDiverging(answer, g)));
			}
		}
	});
});
