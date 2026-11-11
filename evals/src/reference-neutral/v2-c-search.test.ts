/**
 * Independent verification of author C's v2 tasks (p309-p312):
 * - the stored optima of the search tasks are re-derived by brute force over all 16,777,216 opaque
 *   8-bit sRGB colors (or all subsets of the candidate list), with the margins the brief asks for;
 * - every number the graders measure (Oklch L/C/h, WCAG 2 ratio, CIEDE2000, P3 conversion, gamut
 *   mapping) is recomputed with colorjs.io for every color the tasks contain, and the verdict tasks are
 *   re-answered with colorjs.io and graded with the task's own grader;
 * - freshness against v1: no v1 author-C hex reappears in a v2 prompt and no v1 sentence is repeated.
 * Inputs of the colorjs.io answers are restated here on purpose instead of read from the task, so a
 * typo on either side shows up.
 */
import Color from "colorjs.io";
import { afterAll, describe, expect, it } from "vitest";
import { gradeNeutral } from "../graders-neutral/index.js";
import { neutralC } from "../tasks/neutral/cats-neutral-c.js";
import { CHART2_312, neutral2C, SEARCH2_311 } from "../tasks/neutral/cats-neutral2-c.js";
import {
	contrast,
	de2000Hex,
	deutan,
	deutanDERounded,
	hexOfOklch,
	hueDist,
	oklabOfHex,
	oklchOfHex,
	okDist,
	p3ToSrgb,
	rgbToHex,
} from "./c-color.js";
import { bestChartSubset, bruteDual, bruteFix, combinations, minPairDE } from "./c-search.js";

type V3 = [number, number, number];
const tasks = neutral2C();
const byId = (id: string) => {
	const t = tasks.find((x) => x.id === id);
	if (!t) throw new Error(id);
	return t;
};
const failedChecks = (id: string, answer: unknown) =>
	gradeNeutral(byId(id).grader, answer)
		.filter((c) => !c.pass)
		.map((c) => c.name);
const coords = (c: { coords: unknown }) => (c.coords as (number | null)[]).map((v) => Number(v ?? 0)) as V3;
const hexesIn = (s: string) => [...s.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => (m[0] as string).toLowerCase());

const dev: Record<string, string> = {};
afterAll(() =>
	console.log(`colorjs.io deviations (author C v2):\n${Object.entries(dev).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`),
);

describe("311 fix tasks: exhaustive optimum", () => {
	for (const [id, key, field] of [
		["p311-1", "fixDarkText", "toastText"],
		["p311-2", "fixLightText", "keyword"],
	] as const) {
		it(`${id}: stored optimum is the true minimum, witness passes with margin, region is wide`, () => {
			const f = SEARCH2_311[key];
			const r = bruteFix(f.background, f.original, f.target, f.hueTol);
			console.log(`${id} brute force: best ${r.best} dist ${r.dist.toFixed(6)}; feasible ${r.feasible}, within bound ${r.withinBound}`);
			expect(r.best).toBe(f.best);
			expect(Math.abs(r.dist - f.optimum)).toBeLessThan(1e-6);
			const bound = 2 * f.optimum + 0.01;
			expect(failedChecks(id, { [field]: f.best })).toEqual([]);
			expect(okDist(oklabOfHex(f.best), oklabOfHex(f.original))).toBeLessThanOrEqual(0.85 * bound);
			expect(r.withinBound).toBeGreaterThan(1000);
			// The obvious method (move Oklch L at constant C and h until the ratio passes) is accepted.
			const o = oklchOfHex(f.original);
			const dir = contrast("#ffffff", f.background) > contrast("#000000", f.background) ? 1 : -1;
			let L = o.L;
			let h = f.original;
			while (contrast(h, f.background) < f.target) {
				L += dir * 0.001;
				h = hexOfOklch(L, o.C, o.H);
			}
			console.log(`${id} constant-hue L shift gives ${h} at distance ${okDist(oklabOfHex(h), oklabOfHex(f.original)).toFixed(4)} (bound ${bound.toFixed(4)})`);
			expect(failedChecks(id, { [field]: h })).toEqual([]);
			// colorjs.io agrees on the ratio and the hue of the witness and of the L-shift answer.
			for (const x of [f.best, h]) {
				expect(Math.abs(Color.contrast(x, f.background, "WCAG21") - contrast(x, f.background))).toBeLessThan(1e-3);
				expect(hueDist(Number(new Color(x).to("oklch").coords[2]), oklchOfHex(x).H)).toBeLessThan(0.05);
			}
		});
	}
});

describe("311 dual-surface task: exhaustive feasibility", () => {
	it("p311-3: stored max chroma is the true maximum, floor leaves >= 15% margin, witness has slack", () => {
		const d = SEARCH2_311.dual;
		const r = bruteDual(d.light, d.dark, d.min, d.band, d.floor, { min: 3.08, band: [48, 67] });
		console.log(`p311-3 brute force: max chroma ${r.maxChroma.toFixed(6)} at ${r.best}; ${r.countAtFloor} colors at or above the floor; inner witness ${r.inner} (C ${r.innerChroma.toFixed(4)})`);
		expect(Math.abs(r.maxChroma - d.maxChroma)).toBeLessThan(1e-6);
		expect(r.best).toBe(d.best);
		expect(r.maxChroma).toBeGreaterThanOrEqual(1.15 * d.floor);
		expect(r.countAtFloor).toBe(d.feasibleAtFloor);
		expect(r.inner).toBe(d.witness);
		expect(failedChecks("p311-3", { highlight: d.witness })).toEqual([]);
		expect(failedChecks("p311-3", { highlight: d.best })).toEqual([]);
		for (const g of d.commonOranges) expect(failedChecks("p311-3", { highlight: g }).length, g).toBeGreaterThan(0);
		// colorjs.io measures the witness the same way, with room to spare on every rule.
		const c = new Color(d.witness).to("oklch").coords as V3;
		expect(Color.contrast(d.witness, d.light, "WCAG21")).toBeGreaterThan(3.05);
		expect(Color.contrast(d.witness, d.dark, "WCAG21")).toBeGreaterThan(3.05);
		expect(c[1]).toBeGreaterThan(d.floor + 0.01);
		expect(c[2]).toBeGreaterThan(d.band[0] + 2);
		expect(c[2]).toBeLessThan(d.band[1] - 2);
	});
});

describe("311 gamut-mapping tasks against colorjs.io", () => {
	const variants = (mk: () => Color) => ({
		css: rgbToHex(coords(mk().toGamut({ space: "srgb", method: "css" }).to("srgb"))),
		raytrace: rgbToHex(coords(mk().toGamut({ space: "srgb", method: "raytrace" } as never).to("srgb"))),
		chroma: rgbToHex(coords(mk().toGamut({ space: "srgb", method: "oklch.c" }).to("srgb"))),
		clip: rgbToHex(coords(mk().to("srgb"))),
	});
	const report = (id: string, targets: { field: string; ref: string }[], v: Record<string, Record<string, string>>) => {
		const worst: Record<string, number[]> = {};
		for (const x of targets) {
			const r = oklchOfHex(x.ref);
			for (const [k, h] of Object.entries(v[x.field] as Record<string, string>)) {
				const o = oklchOfHex(h);
				const w = worst[k] ?? [0, 0, 0];
				worst[k] = [Math.max(w[0] as number, okDist(oklabOfHex(h), oklabOfHex(x.ref))), Math.max(w[1] as number, Math.abs(o.L - r.L)), Math.max(w[2] as number, hueDist(o.H, r.H))];
			}
		}
		dev[id] = Object.entries(worst)
			.map(([k, [d, l, hh]]) => `${k} Oklab ${(d as number).toFixed(4)}, L ${(l as number).toFixed(4)}, h ${(hh as number).toFixed(2)}°`)
			.join("; ");
	};
	const pick = (targets: { field: string }[], v: Record<string, Record<string, string>>, k: string) =>
		Object.fromEntries(targets.map((x) => [x.field, (v[x.field] as Record<string, string>)[k]]));

	it("p311-4: P3 matrices agree; CSS 4, ray-trace and chroma-only mapping pass, independent clipping fails", () => {
		const t = byId("p311-4");
		const targets = t.grader.params.targets as { field: string; ref: string }[];
		const p3: Record<string, V3> = { alert: [1, 0.12, 0.18], mint: [0.1, 0.85, 0.55], sand: [0.88, 0.78, 0.6] };
		let mat = 0;
		for (const p of Object.values(p3)) {
			const theirs = coords(new Color("p3", p).to("srgb"));
			const ours = p3ToSrgb(p);
			mat = Math.max(mat, ...theirs.map((v, i) => Math.abs(v - (ours[i] as number))));
		}
		expect(mat).toBeLessThan(1e-4);
		const v = Object.fromEntries(targets.map((x) => [x.field, variants(() => new Color("p3", p3[x.field] as V3))]));
		report("p311-4", targets, v);
		dev["p311-4 P3->sRGB matrix"] = `max ${mat.toExponential(2)} per encoded channel`;
		expect(failedChecks("p311-4", pick(targets, v, "css"))).toEqual([]);
		expect(failedChecks("p311-4", pick(targets, v, "raytrace"))).toEqual([]);
		expect(failedChecks("p311-4", pick(targets, v, "chroma"))).toEqual([]);
		expect(failedChecks("p311-4", pick(targets, v, "clip")).length).toBeGreaterThan(0);
	});

	it("p311-5: same for the Oklch lightness shifts", () => {
		const base = new Color("#7048e8").to("oklch").coords as V3;
		const shifts: Record<string, number> = { hover: -0.06, "on-dark": 0.15, tint: 0.25 };
		const targets = byId("p311-5").grader.params.targets as { field: string; ref: string }[];
		const v = Object.fromEntries(
			Object.entries(shifts).map(([f, dl]) => [f, variants(() => new Color("oklch", [base[0] + dl, base[1], base[2]]))]),
		);
		report("p311-5", targets, v);
		expect(failedChecks("p311-5", pick(targets, v, "css"))).toEqual([]);
		expect(failedChecks("p311-5", pick(targets, v, "raytrace"))).toEqual([]);
		expect(failedChecks("p311-5", pick(targets, v, "chroma"))).toEqual([]);
		expect(failedChecks("p311-5", pick(targets, v, "clip")).length).toBeGreaterThan(0);
	});
});

describe("312-2 chart palette: exhaustive subset search", () => {
	it("stored best set and threshold are the true optimum; verdicts are robust to implementation variants", () => {
		const c = CHART2_312;
		const r = bestChartSubset(c.candidates, c.background, c.k, 3);
		expect(r.best).toEqual(c.best);
		expect(Math.abs(r.score - c.bestScore)).toBeLessThan(1e-3);
		expect(Math.abs(0.85 * r.score - c.threshold)).toBeLessThan(1e-3);
		// colorjs.io variants: its CIEDE2000 fed its own D65 Lab of our simulated colors, and our pipeline
		// with the simulated colors rounded to 8-bit first.
		const lab = (h: string) => new Color("lab", coords(new Color("srgb", [...deutan(h)] as V3).to("lab-d65")));
		const cjs = (a: string, b: string) => lab(a).deltaE(lab(b), "2000");
		let gap = Number.POSITIVE_INFINITY;
		let passing = 0;
		let worst = 0;
		for (const s of combinations(r.eligible, c.k)) {
			const mine = minPairDE(s);
			const rounded = minPairDE(s, deutanDERounded);
			const theirs = minPairDE(s, cjs);
			worst = Math.max(worst, Math.abs(theirs - mine));
			expect(mine >= c.threshold, s.join()).toBe(rounded >= c.threshold);
			expect(mine >= c.threshold, s.join()).toBe(theirs >= c.threshold);
			gap = Math.min(gap, Math.abs(mine - c.threshold));
			if (mine >= c.threshold) passing++;
		}
		dev["p312-2"] = `max |min-pair ΔE00 (colorjs) - ours| ${worst.toFixed(4)}; closest subset ${gap.toFixed(3)} from the threshold`;
		expect(passing).toBeGreaterThan(1);
		expect(failedChecks("p312-2", { series: c.best })).toEqual([]);
		expect(minPairDE(c.normalVisionBest)).toBeLessThan(c.threshold);
		expect(bestChartSubset(c.candidates, c.background, c.k, 0).best).toEqual(c.ignoringContrast);
		expect(Color.contrast("#2f3b8f", c.background, "WCAG21")).toBeLessThan(3);
	});
});

describe("312 verdict tasks re-answered with colorjs.io", () => {
	it("p312-1: contrast and the px/pt large-text rule", () => {
		const rows: [string, string, string, number, boolean][] = [
			["hero-title", "#ffffff", "#d6457a", 28, false],
			["card-heading", "#ffffff", "#2f9e8f", 20, true],
			["intro", "#ffffff", "#3d8bd9", 20, false],
			["cta-label", "#ffffff", "#e8590c", 16, true],
			["body", "#5a6270", "#f4f6f8", 16, false],
			["fine-print", "#7a7f87", "#ffffff", 12, false],
			["sale-badge", "#ffffff", "#f08c3a", 24, true],
			["link", "#2b6cb0", "#ffffff", 15, false],
		];
		let worst = 0;
		const failing = rows
			.filter(([, fg, bg, px, bold]) => {
				const cr = Color.contrast(fg, bg, "WCAG21");
				worst = Math.max(worst, Math.abs(cr - contrast(fg, bg)));
				const large = px * 0.75 >= 18 || (bold && px * 0.75 >= 14);
				return cr < (large ? 3 : 4.5);
			})
			.map(([id]) => id);
		dev["p312-1"] = `max |WCAG ratio diff| ${worst.toExponential(2)}`;
		expect(failedChecks("p312-1", { failing })).toEqual([]);
		expect(byId("p312-1").prompt).toContain("- intro: #ffffff on #3d8bd9, 20px regular");
	});

	it("p312-3: same near-duplicate pairs with colorjs's CIEDE2000, on D65 or on its default D50 Lab", () => {
		const prompt = byId("p312-3").prompt;
		const tokens = [...prompt.matchAll(/- ([\w-]+) = (#[0-9a-f]{6})/g)].map((m) => [m[1] as string, m[2] as string] as const);
		expect(tokens).toHaveLength(12);
		let worst = 0;
		const d50: string[][] = [];
		const d65: string[][] = [];
		for (let i = 0; i < tokens.length; i++)
			for (let j = i + 1; j < tokens.length; j++) {
				const [a, ha] = tokens[i] as readonly [string, string];
				const [b, hb] = tokens[j] as readonly [string, string];
				const e50 = new Color(ha).deltaE(new Color(hb), "2000");
				const e65 = new Color("lab", coords(new Color(ha).to("lab-d65"))).deltaE(new Color("lab", coords(new Color(hb).to("lab-d65"))), "2000");
				worst = Math.max(worst, Math.abs(e65 - de2000Hex(ha, hb)));
				if (e50 < 3) d50.push([a, b].sort());
				if (e65 < 3) d65.push([a, b].sort());
			}
		dev["p312-3"] = `max |colorjs D65 CIEDE2000 - ours| ${worst.toFixed(4)}`;
		expect(failedChecks("p312-3", { pairs: d65 })).toEqual([]);
		expect(failedChecks("p312-3", { pairs: d50 })).toEqual([]);
	});

	it("p312-5: non-text contrast on two light surfaces", () => {
		const surfaces = { card: "#ffffff", page: "#e6eaf0" };
		const parts = { "checkbox-border": "#868e9c", "toggle-track-off": "#c3cad5", "slider-fill": "#3f6fe0", "online-dot": "#12b886", "tab-underline": "#9775fa", "error-icon": "#e03131" };
		const failing = Object.entries(parts).flatMap(([component, ph]) =>
			Object.entries(surfaces)
				.filter(([, sh]) => Color.contrast(ph, sh, "WCAG21") < 3)
				.map(([background]) => ({ component, background })),
		);
		expect(failedChecks("p312-5", { failing })).toEqual([]);
	});
});

describe("measurements the constraint graders take agree with colorjs.io", () => {
	it("Oklch L, C, h and WCAG ratios of every color in the p309, p310 and p312-4 witnesses and invalid answers", () => {
		const ids = tasks.filter((t) => t.category === 309 || t.category === 310 || t.id === "p312-4").map((t) => t.id);
		const hexes = new Set<string>();
		for (const id of ids) {
			const t = byId(id);
			for (const h of hexesIn(JSON.stringify([t.witness, t.invalid, t.prompt]))) hexes.add(h);
		}
		let dL = 0;
		let dC = 0;
		let dH = 0;
		for (const h of hexes) {
			const [L, C, H] = coords(new Color(h).to("oklch"));
			const o = oklchOfHex(h);
			dL = Math.max(dL, Math.abs(L - o.L));
			dC = Math.max(dC, Math.abs(C - o.C));
			if (o.C >= 0.02) dH = Math.max(dH, hueDist(H, o.H));
		}
		const list = [...hexes];
		let dR = 0;
		for (let i = 0; i < list.length; i += 3)
			for (let j = i + 1; j < list.length; j += 7)
				dR = Math.max(dR, Math.abs(Color.contrast(list[i] as string, list[j] as string, "WCAG21") - contrast(list[i] as string, list[j] as string)));
		dev["309/310/312-4 colors"] = `${hexes.size} colors: max |ΔL| ${dL.toExponential(2)}, |ΔC| ${dC.toExponential(2)}, Δh ${dH.toExponential(2)}° (C >= 0.02), WCAG ratio ${dR.toExponential(2)}`;
		expect(dL).toBeLessThan(1e-4);
		expect(dC).toBeLessThan(1e-4);
		expect(dH).toBeLessThan(0.05);
		expect(dR).toBeLessThan(1e-3);
	});
});

describe("v2 freshness against v1", () => {
	it("no hex shown in a v1 author-C prompt or witness is an input of a v2 prompt (black and white aside)", () => {
		const v1Hex = new Set(neutralC().flatMap((t) => [...hexesIn(t.prompt), ...hexesIn(JSON.stringify(t.witness))]));
		const v2Hex = new Set(tasks.flatMap((t) => hexesIn(t.prompt)));
		const reused = [...v2Hex].filter((h) => v1Hex.has(h) && h !== "#000000" && h !== "#ffffff");
		expect(reused).toEqual([]);
	});
	it("no v2 prompt repeats a sentence of a v1 author-C prompt", () => {
		const sentences = (s: string) =>
			s
				.split(/(?<=[.:?!])\s+|\n+/)
				.map((x) => x.trim())
				.filter((x) => x.length > 40);
		const v1 = new Set(neutralC().flatMap((t) => sentences(t.prompt)));
		const shared = tasks.flatMap((t) =>
			sentences(t.prompt)
				.filter((x) => v1.has(x) && !x.startsWith("Reply with JSON only") && !x.includes("#rrggbb"))
				.map((x) => `${t.id}: ${x}`),
		);
		expect(shared).toEqual([]);
	});
});
