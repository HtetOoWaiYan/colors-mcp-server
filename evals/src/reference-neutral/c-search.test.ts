/**
 * Independent brute-force verification of author C's search tasks (311, 312-2) and cross-checks of
 * the verdict tasks against colorjs.io. For each search task: (1) the witness passes, (2) the feasible
 * region has a real margin, (3) the stored optimum is the true optimum over all 16,777,216 opaque 8-bit
 * sRGB colors (or over all subsets of the stated candidates).
 */
import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { gradeNeutral } from "../graders-neutral/index.js";
import { CHART_312, neutralC, SEARCH_311 } from "../tasks/neutral/cats-neutral-c.js";
import { contrast, de2000Hex, deutan, deutanDERounded, hexOfOklch, hueDist, oklabOfHex, oklchOfHex, okDist, rgbToHex } from "./c-color.js";
import { bestChartSubset, bruteDual, bruteFix, combinations, minPairDE } from "./c-search.js";

const tasks = neutralC();
const byId = (id: string) => {
	const t = tasks.find((x) => x.id === id);
	if (!t) throw new Error(id);
	return t;
};
const passes = (id: string, answer: unknown) => gradeNeutral(byId(id).grader, answer).every((c) => c.pass);
const failedChecks = (id: string, answer: unknown) =>
	gradeNeutral(byId(id).grader, answer)
		.filter((c) => !c.pass)
		.map((c) => c.name);
const coords = (c: { coords: unknown }) => (c.coords as (number | null)[]).map((v) => Number(v ?? 0)) as [number, number, number];

describe("311 fix tasks: exhaustive optimum", () => {
	for (const [id, key, field] of [
		["n311-1", "fixLight", "link"],
		["n311-2", "fixDark", "text"],
	] as const) {
		it(`${id}: stored optimum is the true minimum, witness passes with margin, region is wide`, () => {
			const f = SEARCH_311[key];
			const r = bruteFix(f.background, f.original, f.target, f.hueTol);
			console.log(`${id} brute force: best ${r.best} dist ${r.dist.toFixed(6)}; feasible ${r.feasible}, within bound ${r.withinBound}`);
			expect(r.best).toBe(f.best);
			expect(Math.abs(r.dist - f.optimum)).toBeLessThan(1e-6);
			const bound = 2 * f.optimum + 0.01;
			// (1) witness passes and sits well inside the distance bound
			expect(passes(id, { [field]: f.best })).toBe(true);
			expect(okDist(oklabOfHex(f.best), oklabOfHex(f.original))).toBeLessThanOrEqual(0.85 * bound);
			// (2) many colors are acceptable, not a single point
			expect(r.withinBound).toBeGreaterThan(1000);
			// The obvious method (shift Oklch L at constant C and h until the ratio passes) is accepted.
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
		});
	}
});

describe("311 dual-surface task: exhaustive feasibility", () => {
	it("n311-3: stored max chroma is the true maximum, floor leaves >= 15% margin, witness has slack", () => {
		const d = SEARCH_311.dual;
		const r = bruteDual(d.light, d.dark, d.min, d.band, d.floor, { min: 3.08, band: [155, 175] });
		console.log(`n311-3 brute force: max chroma ${r.maxChroma.toFixed(6)} at ${r.best}; ${r.countAtFloor} colors at or above the floor; inner witness ${r.inner} (C ${r.innerChroma.toFixed(4)})`);
		expect(Math.abs(r.maxChroma - d.maxChroma)).toBeLessThan(1e-6);
		expect(r.best).toBe(d.best);
		expect(r.maxChroma).toBeGreaterThanOrEqual(1.15 * d.floor);
		expect(r.countAtFloor).toBe(12687);
		expect(r.inner).toBe(d.witness);
		expect(r.innerChroma).toBeGreaterThan(d.floor);
		expect(passes("n311-3", { brand: d.witness })).toBe(true);
		expect(passes("n311-3", { brand: d.best })).toBe(true);
		expect(passes("n311-3", { brand: d.current })).toBe(false);
		for (const g of d.commonGreens) expect(passes("n311-3", { brand: g }), g).toBe(false);
	});
});

describe("311 gamut-mapping tasks against colorjs.io", () => {
	const variants = (c: () => Color) => ({
		chroma: rgbToHex(coords(c().toGamut({ space: "srgb", method: "oklch.c" }).to("srgb"))),
		css: rgbToHex(coords(c().toGamut({ space: "srgb", method: "css" }).to("srgb"))),
		raytrace: rgbToHex(coords(c().toGamut({ space: "srgb", method: "raytrace" } as never).to("srgb"))),
		clip: rgbToHex(coords(c().to("srgb"))),
	});

	it("n311-4: CSS 4 JND and ray-trace mapping pass, independent clipping fails", () => {
		const t = byId("n311-4");
		const targets = t.grader.params.targets as { field: string; ref: string }[];
		const p3: Record<string, [number, number, number]> = { "badge-green": [0, 0.95, 0.45], "promo-pink": [0.85, 0.3, 0.55] };
		const v = Object.fromEntries(targets.map((x) => [x.field, variants(() => new Color("p3", p3[x.field] as [number, number, number]))]));
		for (const x of targets) {
			const vv = v[x.field] as Record<string, string>;
			const d = (h: string) => okDist(oklabOfHex(h), oklabOfHex(x.ref)).toFixed(4);
			console.log(`n311-4 ${x.field}: ref ${x.ref}; colorjs css ${vv.css} (${d(vv.css as string)}), raytrace ${vv.raytrace} (${d(vv.raytrace as string)}), clip ${vv.clip} (${d(vv.clip as string)})`);
		}
		const pick = (k: string) => Object.fromEntries(targets.map((x) => [x.field, (v[x.field] as Record<string, string>)[k]]));
		expect(failedChecks("n311-4", pick("css"))).toEqual([]);
		expect(failedChecks("n311-4", pick("raytrace"))).toEqual([]);
		expect(failedChecks("n311-4", pick("clip")).length).toBeGreaterThan(0);
	});

	it("n311-5: same for the L-shifted tokens", () => {
		const base = oklchOfHex("#ea580c");
		const shifts: Record<string, number> = { "dark-mode": 0.18, pressed: -0.1 };
		const v = Object.fromEntries(
			Object.entries(shifts).map(([f, dl]) => [f, variants(() => new Color("oklch", [base.L + dl, base.C, base.H]))]),
		);
		const targets = byId("n311-5").grader.params.targets as { field: string; ref: string }[];
		for (const x of targets) {
			const vv = v[x.field] as Record<string, string>;
			const d = (h: string) => okDist(oklabOfHex(h), oklabOfHex(x.ref)).toFixed(4);
			const dh = (h: string) => hueDist(oklchOfHex(h).H, oklchOfHex(x.ref).H).toFixed(2);
			console.log(`n311-5 ${x.field}: ref ${x.ref}; colorjs css ${vv.css} (${d(vv.css as string)}, ${dh(vv.css as string)}°), raytrace ${vv.raytrace} (${d(vv.raytrace as string)}), clip ${vv.clip} (${d(vv.clip as string)}, ${dh(vv.clip as string)}°)`);
		}
		const pick = (k: string) => Object.fromEntries(targets.map((x) => [x.field, (v[x.field] as Record<string, string>)[k]]));
		expect(failedChecks("n311-5", pick("css"))).toEqual([]);
		expect(failedChecks("n311-5", pick("raytrace"))).toEqual([]);
		expect(failedChecks("n311-5", pick("clip")).length).toBeGreaterThan(0);
	});
});

describe("312-2 chart palette: exhaustive subset search", () => {
	it("stored best set and threshold are the true optimum; verdicts are robust to implementation variants", () => {
		const r = bestChartSubset(CHART_312.candidates, CHART_312.background, 5, 3);
		expect(r.best).toEqual(CHART_312.best);
		expect(Math.abs(r.score - CHART_312.bestScore)).toBeLessThan(1e-4);
		expect(Math.abs(0.85 * r.score - CHART_312.threshold)).toBeLessThan(1e-3);
		const thr = CHART_312.threshold;
		const subsets = combinations(r.eligible, 5);
		// colorjs.io variant: its CIEDE2000 fed D65 Lab of our simulated colors (formula cross-check),
		// and our own pipeline with the simulated colors rounded to 8-bit first.
		const cjs = (a: string, b: string) =>
			new Color("lab", coords(new Color("srgb", [...deutan(a)] as [number, number, number]).to("lab-d65"))).deltaE(
				new Color("lab", coords(new Color("srgb", [...deutan(b)] as [number, number, number]).to("lab-d65"))),
				"2000",
			);
		let gap = Number.POSITIVE_INFINITY;
		let passing = 0;
		for (const s of subsets) {
			const mine = minPairDE(s);
			const rounded = minPairDE(s, deutanDERounded);
			const theirs = minPairDE(s, cjs);
			expect(mine >= thr, s.join()).toBe(rounded >= thr);
			expect(mine >= thr, s.join()).toBe(theirs >= thr);
			gap = Math.min(gap, Math.abs(mine - thr));
			if (mine >= thr) passing++;
		}
		console.log(`n312-2: ${subsets.length} eligible subsets, ${passing} pass; closest subset score is ${gap.toFixed(3)} from the threshold ${thr}`);
		expect(passing).toBeGreaterThan(1);
		expect(passes("n312-2", { picks: CHART_312.best })).toBe(true);
		expect(minPairDE(CHART_312.normalVisionBest)).toBeLessThan(thr);
	});
});

describe("312 verdict tasks agree with colorjs.io", () => {
	it("n312-1 and n312-5 contrast verdicts", () => {
		for (const id of ["n312-1", "n312-5"]) {
			const ratios = byId(id).grader.params.derivation.ratios as { ratio: number; threshold?: number }[];
			expect(ratios.length).toBeGreaterThan(5);
		}
		const t = byId("n312-1").prompt;
		const lines = [...t.matchAll(/- ([\w-]+): text (#[0-9a-f]{6}) on (#[0-9a-f]{6}) \((normal|large)\)/g)];
		expect(lines).toHaveLength(8);
		const failing = lines.filter((m) => Color.contrast(m[2] as string, m[3] as string, "WCAG21") < (m[4] === "large" ? 3 : 4.5)).map((m) => m[1]);
		expect(passes("n312-1", { failing })).toBe(true);
	});

	it("n312-3 near-duplicates: same verdicts with colorjs's CIEDE2000, D65 or its default D50 Lab", () => {
		const prompt = byId("n312-3").prompt;
		const tokens = [...prompt.matchAll(/- ([\w-]+): (#[0-9a-f]{6})/g)].map((m) => [m[1] as string, m[2] as string] as const);
		expect(tokens).toHaveLength(10);
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
		console.log(`n312-3: max |colorjs D65 CIEDE2000 - ours| = ${worst.toFixed(4)}`);
		expect(passes("n312-3", { nearDuplicates: d65 })).toBe(true);
		expect(passes("n312-3", { nearDuplicates: d50 })).toBe(true);
	});
});
