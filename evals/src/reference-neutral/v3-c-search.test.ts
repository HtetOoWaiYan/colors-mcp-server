/**
 * Independent verification of author C's v3 tasks (q309-q312):
 * - the stored optima of the search tasks are re-derived by brute force over all 16,777,216 opaque
 *   8-bit sRGB colors, with the margins the brief asks for, and the bounds are probed with the obvious
 *   shortcuts (constant-chroma L shift, HSL darkening, common palette colors);
 * - the chart pick is re-derived over all subsets, and the share of random picks that pass is counted
 *   by grading every 5-subset with the task's own grader;
 * - every number the graders measure (Oklch L/C/h, WCAG 2 ratio, CIEDE2000, CIE76, P3 conversion,
 *   gamut mapping, CSS color parsing) is recomputed with colorjs.io for the colors the tasks contain,
 *   and the verdict tasks are re-answered with colorjs.io and graded with the task's own grader;
 * - freshness: no v1 or v2 hex code (any author) appears in a v3 author-C prompt.
 * Inputs of the colorjs.io answers are restated here on purpose instead of read from the task, so a
 * typo on either side shows up.
 */
import Color from "colorjs.io";
import { afterAll, describe, expect, it } from "vitest";
import { gradeNeutral } from "../graders-neutral/index.js";
import { buildAllNeutral } from "../tasks/neutral/build-neutral.js";
import { buildAllNeutral2 } from "../tasks/neutral/build-neutral2.js";
import { CHART3_312, neutral3C, SEARCH3_311 } from "../tasks/neutral/cats-neutral3-c.js";
import { contrast, deutan, deutanDERounded, hexOfOklch, hueDist, oklabOfHex, oklchOfHex, okDist, p3ToSrgb, rgbToHex } from "./c-color.js";
import { combinations, minPairDE } from "./c-search.js";
import { bruteChromaMax, bruteFixMulti, chartSearch } from "./v3-c-search.js";

type V3 = [number, number, number];
const tasks = neutral3C();
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
const cjsContrast = (a: string, b: string) => Color.contrast(a, b, "WCAG21");
const cjsLab65 = (c: Color) => new Color("lab", coords(c.to("lab-d65")));

const dev: Record<string, string> = {};
afterAll(() => console.log(`colorjs.io deviations (author C v3):\n${Object.entries(dev).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`));

/** Walk Oklch L at constant C and h (gamut-mapped) until every floor passes; the obvious method. */
function lShift(original: string, floors: { hex: string; min: number }[]): string | null {
	const o = oklchOfHex(original);
	for (const dir of [1, -1]) {
		let L = o.L;
		let h = original;
		for (let i = 0; i < 1200 && L > 0 && L < 1; i++) {
			if (floors.every((f) => contrast(h, f.hex) >= f.min)) return h;
			L += dir * 0.001;
			h = hexOfOklch(L, o.C, o.H);
		}
	}
	return null;
}

/** CSS hsl() lightness darkening in steps of 0.5% until every floor passes (a common shortcut). */
function hslDarken(original: string, floors: { hex: string; min: number }[]): string {
	const c = new Color(original).to("hsl");
	const [h, s, l] = coords(c);
	for (let L = l; L >= 0; L -= 0.5) {
		const hex = rgbToHex(coords(new Color("hsl", [h, s, L]).to("srgb")));
		if (floors.every((f) => contrast(hex, f.hex) >= f.min)) return hex;
	}
	return "#000000";
}

describe("311 fix tasks: exhaustive optimum, tight bound, shortcuts", () => {
	const cases = [
		{ id: "q311-1", field: "label", f: SEARCH3_311.chip, floors: [{ hex: SEARCH3_311.chip.fill, min: 4.5 }] },
		{
			id: "q311-2",
			field: "link",
			f: SEARCH3_311.link,
			floors: [
				{ hex: SEARCH3_311.link.page, min: 7 },
				{ hex: SEARCH3_311.link.callout, min: 7 },
			],
		},
	] as const;
	for (const { id, field, f, floors } of cases) {
		it(`${id}: stored optimum is the true minimum, witness beats the bound by >= 15%, region is wide`, () => {
			const r = bruteFixMulti(f.original, [...floors].map((x) => ({ bg: x.hex, min: x.min })), f.hueTol, 1.2);
			const bound = 1.2 * f.optimum;
			const within = r.near.filter((d) => d <= bound + 1e-9).length;
			console.log(`${id} brute force: best ${r.best} dist ${r.dist.toFixed(6)}; feasible ${r.feasible}; within 1.2 x optimum ${within}`);
			expect(r.best).toBe(f.best);
			expect(Math.abs(r.dist - f.optimum)).toBeLessThan(1e-6);
			expect(r.feasible).toBe(f.feasible);
			expect(within).toBe(f.withinBound);
			expect(within).toBeGreaterThan(1000);
			expect(failedChecks(id, { [field]: f.best })).toEqual([]);
			expect(okDist(oklabOfHex(f.best), oklabOfHex(f.original)) * 1.15).toBeLessThanOrEqual(bound);
			// Shortcuts, reported: the constant-chroma Oklch L walk is nearly optimal and passes; HSL
			// darkening (when it applies) and overshooting are what the 1.2x bound is there to catch.
			const ls = lShift(f.original, [...floors]);
			const hd = hslDarken(f.original, [...floors]);
			const lsd = ls ? okDist(oklabOfHex(ls), oklabOfHex(f.original)) : Number.NaN;
			const hdd = okDist(oklabOfHex(hd), oklabOfHex(f.original));
			console.log(
				`${id} shortcuts: Oklch L walk ${ls} at ${lsd.toFixed(4)} (${(lsd / f.optimum).toFixed(3)} x opt, ${ls ? failedChecks(id, { [field]: ls }).join(",") || "passes" : "-"}); HSL darkening ${hd} at ${hdd.toFixed(4)} (${(hdd / f.optimum).toFixed(3)} x opt, ${failedChecks(id, { [field]: hd }).join(",") || "passes"})`,
			);
			expect(ls).not.toBeNull();
			expect(failedChecks(id, { [field]: ls })).toEqual([]);
			// colorjs.io agrees on the ratio and the hue of the witness.
			for (const x of floors) expect(Math.abs(cjsContrast(f.best, x.hex) - contrast(f.best, x.hex))).toBeLessThan(1e-3);
			expect(hueDist(coords(new Color(f.best).to("oklch"))[2], oklchOfHex(f.best).H)).toBeLessThan(0.05);
			expect(hueDist(coords(new Color(f.original).to("oklch"))[2], oklchOfHex(f.original).H)).toBeLessThan(0.05);
		});
	}

	it("q311-1: no lighter label can pass (even white misses 4.5:1 on the fill)", () => {
		expect(cjsContrast("#ffffff", SEARCH3_311.chip.fill)).toBeLessThan(4);
		const lightOnly = bruteFixMulti(SEARCH3_311.chip.original, [{ bg: SEARCH3_311.chip.fill, min: 4.5 }], 8, 0);
		expect(oklchOfHex(lightOnly.best).L).toBeLessThan(oklchOfHex(SEARCH3_311.chip.fill).L);
	});

	it("q311-2: the page-only optimum misses the callout", () => {
		const f = SEARCH3_311.link;
		const r = bruteFixMulti(f.original, [{ bg: f.page, min: 7 }], f.hueTol, 0);
		expect(r.best).toBe(f.pageOnly);
		expect(failedChecks("q311-2", { link: f.pageOnly })).toEqual(["contrast-vs-callout"]);
	});
});

describe("311 badge: exhaustive chroma maximum in a narrow luminance window", () => {
	it("q311-3: stored max chroma is the true maximum, floor leaves >= 15% margin, witness has slack, common pinks fail", () => {
		const d = SEARCH3_311.badge;
		const floors = [
			{ bg: d.page, min: 3 },
			{ bg: d.footer, min: 3 },
			{ bg: d.label, min: 4.5 },
		];
		const r = bruteChromaMax(floors, d.band, d.floor, { mins: [3.03, 3.03, 4.55], band: [353, 12] });
		console.log(`q311-3 brute force: max chroma ${r.maxChroma.toFixed(6)} at ${r.best}; ${r.countAtFloor} colors at or above the floor; inner witness ${r.inner} (C ${r.innerChroma.toFixed(4)})`);
		expect(Math.abs(r.maxChroma - d.maxChroma)).toBeLessThan(1e-6);
		expect(r.best).toBe(d.best);
		expect(r.maxChroma).toBeGreaterThanOrEqual(1.15 * d.floor);
		expect(r.countAtFloor).toBe(d.countAtFloor);
		expect(r.inner).toBe(d.witness);
		expect(failedChecks("q311-3", { badge: d.witness })).toEqual([]);
		expect(failedChecks("q311-3", { badge: d.best })).toEqual([]);
		for (const g of d.commonPinks) expect(failedChecks("q311-3", { badge: g }).length, g).toBeGreaterThan(0);
		const c = coords(new Color(d.witness).to("oklch"));
		for (const f of floors) expect(cjsContrast(d.witness, f.bg)).toBeGreaterThanOrEqual(f.min + 0.02);
		expect(c[1]).toBeGreaterThan(d.floor + 0.02);
		expect(hueDist(c[2], 0)).toBeLessThan(10);
	});
});

describe("311 gamut-mapping tasks against colorjs.io", () => {
	const variants = (mk: () => Color) => ({
		css: rgbToHex(coords(mk().toGamut({ space: "srgb", method: "css" }).to("srgb"))),
		raytrace: rgbToHex(coords(mk().toGamut({ space: "srgb", method: "raytrace" } as never).to("srgb"))),
		chroma: rgbToHex(coords(mk().toGamut({ space: "srgb", method: "oklch.c" }).to("srgb"))),
		clip: rgbToHex(coords(mk().to("srgb"))),
	});
	type Target = { field: string; ref: string };
	const worstOf = (targets: Target[], v: Record<string, Record<string, string>>, key: string) => {
		let d = 0;
		let l = 0;
		let h = 0;
		for (const t of targets) {
			const x = (v[t.field] as Record<string, string>)[key] as string;
			const r = oklchOfHex(t.ref);
			const o = oklchOfHex(x);
			d = Math.max(d, okDist(oklabOfHex(x), oklabOfHex(t.ref)));
			l = Math.max(l, Math.abs(o.L - r.L));
			h = Math.max(h, hueDist(o.H, r.H));
		}
		return `${d.toFixed(4)} Oklab / ${l.toFixed(4)} L / ${h.toFixed(2)}°`;
	};

	it("q311-4: P3 conversion, the out-of-gamut verdicts and every accepted mapping variant", () => {
		const p3: Record<string, V3> = { fern: [0.08, 0.82, 0.3], coral: [0.96, 0.5, 0.36], iris: [0.6, 0.2, 0.95], wheat: [0.9, 0.82, 0.62] };
		let conv = 0;
		for (const p of Object.values(p3)) {
			const theirs = coords(new Color("p3", p).to("srgb"));
			const mine = p3ToSrgb(p);
			for (let k = 0; k < 3; k++) conv = Math.max(conv, Math.abs((theirs[k] as number) - (mine[k] as number)));
		}
		dev["q311-4 P3->sRGB (encoded channel)"] = conv.toExponential(2);
		expect(conv).toBeLessThan(1e-5);
		const outside = Object.entries(p3)
			.filter(([, p]) => !new Color("p3", p).inGamut("srgb"))
			.map(([k]) => k);
		expect(outside).toEqual(["fern", "coral"]);
		const targets = (byId("q311-4").grader.params as { targets: Target[] }).targets;
		const v = Object.fromEntries(Object.entries(p3).map(([k, p]) => [k, variants(() => new Color("p3", p))]));
		for (const key of ["css", "raytrace", "chroma"] as const) {
			const answer = { ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x[key]])), outsideSrgb: outside };
			expect(failedChecks("q311-4", answer), key).toEqual([]);
			dev[`q311-4 ${key} vs reference (worst)`] = worstOf(targets, v, key);
		}
		dev["q311-4 per-channel clip vs reference (worst)"] = worstOf(targets, v, "clip");
		const clip = { ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.clip])), outsideSrgb: outside };
		expect(failedChecks("q311-4", clip).some((n) => n.startsWith("fern-"))).toBe(true);
	});

	it("q311-5: relative Oklch L moves of the pink, every accepted mapping variant passes, clipping does not", () => {
		const base = coords(new Color("#d43f86").to("oklch"));
		const Ls: Record<string, number> = { tint: base[0] + 0.45 * (1 - base[0]), shade: 0.7 * base[0], deep: 0.4 * base[0] };
		const targets = (byId("q311-5").grader.params as { targets: Target[] }).targets;
		const v = Object.fromEntries(Object.entries(Ls).map(([k, L]) => [k, variants(() => new Color("oklch", [L, base[1], base[2]]))]));
		for (const key of ["css", "raytrace", "chroma"] as const) {
			const answer = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x[key]]));
			expect(failedChecks("q311-5", answer), key).toEqual([]);
			dev[`q311-5 ${key} vs reference (worst)`] = worstOf(targets, v, key);
		}
		dev["q311-5 per-channel clip vs reference (worst)"] = worstOf(targets, v, "clip");
		const clip = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.clip]));
		const f = failedChecks("q311-5", clip);
		expect(f.some((n) => n.startsWith("tint-")) && f.some((n) => n.startsWith("deep-"))).toBe(true);
	});
});

describe("312 chart pick: exhaustive subsets and the value of a lucky guess", () => {
	it("q312-2: best set, threshold, margin; random 5-subsets almost never pass", () => {
		const c = CHART3_312;
		const s = chartSearch(c.candidates, [c.light, c.dark], 3, 5, 0.85);
		const p = byId("q312-2").grader.params as { threshold: number };
		expect(Math.abs(s.threshold - p.threshold)).toBeLessThan(1e-4);
		expect(s.score).toBeGreaterThanOrEqual(1.15 * p.threshold);
		// Independent count: grade every 5-subset of the 16 candidates with the task's own grader.
		let pass = 0;
		const all = combinations(c.candidates, 5);
		for (const sub of all) if (failedChecks("q312-2", { series: sub }).length === 0) pass++;
		console.log(`q312-2: best ${s.best.join(" ")} score ${s.score.toFixed(3)}, threshold ${p.threshold}; ${pass} of ${all.length} random 5-subsets pass (${((100 * pass) / all.length).toFixed(2)}%)`);
		expect(pass).toBe(s.passing);
		expect(pass / all.length).toBeLessThan(0.01);
		// Eligibility against colorjs.io's WCAG ratio, with room: no candidate within 0.1 of 3:1.
		for (const h of c.candidates)
			for (const bg of [c.light, c.dark]) expect(Math.abs(cjsContrast(h, bg) - 3), `${h} on ${bg}`).toBeGreaterThan(0.1);
		// colorjs.io CIEDE2000 (fed D65 Lab of the simulated colors) agrees with the reference.
		let d = 0;
		for (let i = 0; i < s.eligible.length; i++)
			for (let j = i + 1; j < s.eligible.length; j++) {
				const a = s.eligible[i] as string;
				const b = s.eligible[j] as string;
				const lab = (h: string) => cjsLab65(new Color("srgb", [...deutan(h)] as V3));
				d = Math.max(d, Math.abs(lab(a).deltaE(lab(b), "2000") - minPairDE([a, b])));
			}
		dev["q312-2 deutan CIEDE2000 (colorjs ΔE2000 on D65 Lab)"] = d.toExponential(2);
		expect(d).toBeLessThan(0.01);
		// Legitimate variant: rounding the simulated colors to 8-bit first. The best set still passes.
		const rounded = minPairDE(s.best, deutanDERounded);
		console.log(`q312-2 best set with rounded simulation: ${rounded.toFixed(3)} (threshold ${p.threshold})`);
		expect(rounded).toBeGreaterThanOrEqual(p.threshold);
	});
});

describe("verdict tasks re-answered with colorjs.io", () => {
	it("q312-1: mixed CSS notations parsed and measured by colorjs.io give the same failing set", () => {
		const rows: [string, string, string, number][] = [
			["price-label", "#a55", "#fbf7f2", 4.5],
			["hero-heading", "hsl(205 70% 45%)", "#f9fbfd", 3],
			["body-copy", "rgb(118 122 130)", "hsl(40 33% 96%)", 4.5],
			["badge-text", "#fdfdfd", "hsl(150 60% 36%)", 4.5],
			["footer-note", "hsl(220 9% 50%)", "#1d2027", 4.5],
			["caption", "#777", "#f2f2f2", 4.5],
			["nav-link", "rgb(46, 104, 168)", "hsl(210, 40%, 94%)", 4.5],
			["sale-banner", "hsl(0 0% 100%)", "hsl(14 85% 58%)", 3],
		];
		const failing = rows.filter(([, fg, bg, t]) => Color.contrast(new Color(fg), new Color(bg), "WCAG21") < t).map(([id]) => id);
		expect(failedChecks("q312-1", { failing })).toEqual([]);
		let worst = Number.POSITIVE_INFINITY;
		for (const [, fg, bg, t] of rows) worst = Math.min(worst, Math.abs(Color.contrast(new Color(fg), new Color(bg), "WCAG21") - t));
		dev["q312-1 smallest |ratio - threshold| (colorjs)"] = worst.toFixed(3);
		expect(worst).toBeGreaterThanOrEqual(0.15);
	});

	it("q312-3: colorjs.io CIEDE2000 on D65 Lab gives the same pairs; colorjs CIE76 gives the trap answer", () => {
		const tokens: [string, string][] = [
			["slate-600", "#5e6168"],
			["icon-default", "#625f67"],
			["violet-500", "#7a3fe0"],
			["focus-ring", "#7933ee"],
			["amber-400", "#f0b429"],
			["warning", "#eeb32e"],
			["paper", "#f7f4ee"],
			["page-bg", "#f3f0e8"],
			["ink", "#23262d"],
			["rose-500", "#e0567a"],
			["sky-500", "#3c95d8"],
			["mint-300", "#8fd9b6"],
		];
		const pairs00: string[][] = [];
		const pairs76: string[][] = [];
		let near = Number.POSITIVE_INFINITY;
		let d50 = 0;
		for (let i = 0; i < tokens.length; i++)
			for (let j = i + 1; j < tokens.length; j++) {
				const [a, ha] = tokens[i] as [string, string];
				const [b, hb] = tokens[j] as [string, string];
				const e00 = cjsLab65(new Color(ha)).deltaE(cjsLab65(new Color(hb)), "2000");
				const e76 = cjsLab65(new Color(ha)).deltaE(cjsLab65(new Color(hb)), "76");
				d50 = Math.max(d50, Math.abs(new Color(ha).deltaE(new Color(hb), "2000") - e00));
				near = Math.min(near, Math.abs(e00 - 3) / 3);
				if (e00 < 3) pairs00.push([a, b]);
				if (e76 < 3) pairs76.push([a, b]);
			}
		dev["q312-3 closest CIEDE2000 to the threshold (relative, colorjs)"] = near.toFixed(3);
		dev["q312-3 D50-Lab (colorjs default) vs D65 CIEDE2000, largest difference"] = d50.toFixed(3);
		expect(near).toBeGreaterThanOrEqual(0.15);
		expect(failedChecks("q312-3", { merge: pairs00 })).toEqual([]);
		expect(failedChecks("q312-3", { merge: pairs76 }).length).toBeGreaterThan(0);
	});

	it("q312-5: translucent parts composited on colorjs.io-parsed colors give the same failing set", () => {
		const surfaces: [string, string][] = [
			["canvas", "#eceae4"],
			["sheet", "#fefdfb"],
		];
		const parts: [string, string][] = [
			["input-border", "rgb(30 34 44 / 0.44)"],
			["divider", "rgb(30 34 44 / 0.16)"],
			["focus-ring", "#4c7ee8"],
			["icon-muted", "rgb(30 34 44 / 0.58)"],
			["toggle-track", "#878d98"],
			["chip-outline", "hsl(262 45% 60%)"],
		];
		const failing: { element: string; on: string }[] = [];
		let worst = Number.POSITIVE_INFINITY;
		for (const [p, css] of parts)
			for (const [s, sh] of surfaces) {
				const fg = new Color(css);
				const a = fg.alpha === undefined ? 1 : Number(fg.alpha);
				const f = coords(fg.to("srgb"));
				const b = coords(new Color(sh).to("srgb"));
				const blended = new Color("srgb", f.map((v, i) => a * v + (1 - a) * (b[i] as number)) as V3);
				const cr = Color.contrast(blended, new Color(sh), "WCAG21");
				worst = Math.min(worst, Math.abs(cr - 3));
				if (cr < 3) failing.push({ element: p, on: s });
			}
		dev["q312-5 smallest |ratio - 3| (colorjs)"] = worst.toFixed(3);
		expect(worst).toBeGreaterThanOrEqual(0.15);
		expect(failedChecks("q312-5", { failing })).toEqual([]);
	});
});

describe("measurements of every witness against colorjs.io", () => {
	it("Oklch L/C/h and WCAG ratios of all hex codes in the v3 author-C witnesses and prompts", () => {
		const hexes = new Set<string>();
		const walk = (v: unknown): void => {
			if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) hexes.add(v.toLowerCase());
			else if (Array.isArray(v)) v.forEach(walk);
			else if (v && typeof v === "object") Object.values(v).forEach(walk);
		};
		for (const t of tasks) {
			walk(t.witness);
			for (const h of hexesIn(t.prompt)) hexes.add(h);
		}
		let dL = 0;
		let dC = 0;
		let dH = 0;
		let dR = 0;
		const list = [...hexes];
		for (const h of list) {
			const [L, C, H] = coords(new Color(h).to("oklch"));
			const m = oklchOfHex(h);
			dL = Math.max(dL, Math.abs(L - m.L));
			dC = Math.max(dC, Math.abs(C - m.C));
			if (m.C >= 0.01) dH = Math.max(dH, hueDist(H, m.H));
		}
		for (let i = 0; i < list.length; i++)
			for (let j = i + 1; j < list.length; j += 7) dR = Math.max(dR, Math.abs(cjsContrast(list[i] as string, list[j] as string) - contrast(list[i] as string, list[j] as string)));
		dev[`Oklch over ${list.length} hex codes`] = `L ${dL.toExponential(2)}, C ${dC.toExponential(2)}, h ${dH.toExponential(2)}° (chroma >= 0.01)`;
		dev["WCAG 2 ratio"] = dR.toExponential(2);
		expect(dL).toBeLessThan(1e-4);
		expect(dC).toBeLessThan(1e-4);
		expect(dH).toBeLessThan(0.05);
		expect(dR).toBeLessThan(1e-3);
	});

	it("tonal-scale and role witnesses keep a margin on the binding contrast rules when measured by colorjs.io", () => {
		// q309-5: 400 against 950 and 600 against the label are the binding pairs of the label switch.
		const s5 = (byId("q309-5").witness as { scale: Record<string, string> }).scale;
		expect(cjsContrast(s5["400"] as string, s5["950"] as string)).toBeGreaterThan(4.5);
		expect(cjsContrast(s5["600"] as string, "#fbfcfd")).toBeGreaterThan(4.5);
		const s3 = (byId("q309-3").witness as { scale: Record<string, string> }).scale;
		expect(cjsContrast(s3["300"] as string, s3["950"] as string)).toBeGreaterThan(7);
		const w = byId("q310-3").witness as Record<string, Record<string, string>>;
		for (const t of ["light", "dark"]) expect(cjsContrast(w[t]?.primary as string, w[t]?.surface as string)).toBeGreaterThan(3);
	});
});

describe("freshness against v1 and v2", () => {
	it("no v1 or v2 hex code (any author) appears in a v3 author-C prompt", () => {
		const old = new Set([...buildAllNeutral(), ...buildAllNeutral2()].flatMap((t) => hexesIn(t.prompt)));
		for (const t of tasks) expect(hexesIn(t.prompt).filter((h) => old.has(h)), t.id).toEqual([]);
	});
});
