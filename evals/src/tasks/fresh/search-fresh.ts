// Build-time only: brute-force searches whose results become the fresh suite's frozen witnesses and thresholds.
import {
	type DivergingNParams,
	type GradientTextParams,
	gradeDivergingN,
	gradeGradientText,
} from "../../graders-fresh/tasks.js";
import type { HueBand } from "../../graders-gen/tasks.js";
import {
	contrastRatio,
	deutanDeltaE,
	hexToRgb,
	hueDiff,
	rgbToOklch,
} from "../../reference/color.js";
import {
	gradientMinContrast,
	stopsMinContrast,
} from "../../reference-fresh/gradient.js";
import { candidates, maxChromaHex } from "../gen/search.js";

const failed = (checks: { name: string; pass: boolean }[]) =>
	checks.filter((c) => !c.pass).map((c) => c.name);

function bandHues(b: HueBand, step: number): number[] {
	const span = (((b.max - b.min) % 360) + 360) % 360;
	const out: number[] = [];
	for (let d = 0; d <= span + 1e-9; d += step) out.push((b.min + d) % 360);
	return out;
}

// Normalized slack per rule, so the witness can maximize the weakest one and near misses can be ranked.
function gradientSlacks(hex: string, p: GradientTextParams): Record<string, number> {
	const c = rgbToOklch(hexToRgb(hex));
	const half = hueDiff(p.hue.min, p.hue.max) / 2;
	const mid = (p.hue.min + half) % 360;
	const s: Record<string, number> = {
		hue_band: (half - hueDiff(c.H, mid)) / 5,
		chroma_min: (c.C - p.cMin) / 0.02,
		contrast_gradient: (gradientMinContrast(hex, p.stops) - p.target) / 0.2,
	};
	if (p.lMin !== undefined) s.lightness_min = (c.L - p.lMin) / 0.02;
	if (p.lMax !== undefined) s.lightness_max = (p.lMax - c.L) / 0.02;
	for (const k of p.also)
		s[`contrast_${k.name}`] = (contrastRatio(hex, k.against) - k.min) / 0.2;
	return s;
}

const minExcept = (s: Record<string, number>, rule?: string) =>
	Math.min(...Object.entries(s).filter(([k]) => k !== rule).map(([, v]) => v));

export interface GradientSearch {
	feasible: number;
	maxChroma: number;
	witness: string;
	witnessSlack: number;
	nearMiss: Record<string, string>;
	/** Passes every rule and clears the target at each stop, but dips below it between stops. */
	stopsOnly: string | null;
}

export function searchGradientText(p: GradientTextParams): GradientSearch {
	const all = candidates({
		min: (p.hue.min - 6 + 360) % 360,
		max: (p.hue.max + 6) % 360,
	});
	let witness = "";
	let best = Number.NEGATIVE_INFINITY;
	let feasible = 0;
	let maxChroma = 0;
	const near: Record<string, { hex: string; score: number }> = {};
	let stopsOnly: { hex: string; score: number } | null = null;
	for (const hex of all) {
		const f = failed(gradeGradientText({ hex }, p));
		const s = gradientSlacks(hex, p);
		if (f.length === 0) {
			feasible++;
			maxChroma = Math.max(maxChroma, rgbToOklch(hexToRgb(hex)).C);
			const w = minExcept(s);
			if (w > best) {
				best = w;
				witness = hex;
			}
		} else if (f.length === 1) {
			const name = f[0] as string;
			const score = minExcept(s, name);
			if (!near[name] || score > (near[name]?.score ?? 0))
				near[name] = { hex, score };
			if (
				name === "contrast_gradient" &&
				stopsMinContrast(hex, p.stops) >= p.target &&
				(!stopsOnly || score > stopsOnly.score)
			)
				stopsOnly = { hex, score };
		}
	}
	return {
		feasible,
		maxChroma,
		witness,
		witnessSlack: best,
		nearMiss: Object.fromEntries(
			Object.entries(near).map(([k, v]) => [k, v.hex]),
		),
		stopsOnly: stopsOnly?.hex ?? null,
	};
}

export interface DivergingNSearch {
	best: number;
	steps: string[];
}

// Maximizes the ends' deuteranopia separation with every other rule met; the task floor is a fraction of it.
export function searchDivergingN(
	p: Omit<DivergingNParams, "deutanMin">,
	center: string,
): DivergingNSearch {
	const cL = rgbToOklch(hexToRgb(center)).L;
	const m = (p.n - 1) / 2;
	const light = p.middle === "light";
	let best = Number.NEGATIVE_INFINITY;
	let steps: string[] = [];
	const inset = (b: HueBand) => ({
		min: (b.min + 3) % 360,
		max: (b.max - 3 + 360) % 360,
	});
	const ends: number[] = [];
	if (light) for (let e = 0.25; e <= p.endL - 0.02 + 1e-9; e += 0.02) ends.push(e);
	else for (let e = p.endL + 0.02; e <= 0.96 + 1e-9; e += 0.02) ends.push(e);
	for (const hA of bandHues(inset(p.hueA), 2.5))
		for (const hB of bandHues(inset(p.hueB), 2.5))
			for (const e of ends) {
				const Ls = Array.from({ length: m }, (_, k) => e + (k * (cL - e)) / m);
				const side = (h: number) => Ls.map((L) => maxChromaHex(L, h, 0.9));
				const cand = [...side(hA), center, ...side(hB).reverse()];
				const d = deutanDeltaE(cand[0] as string, cand[p.n - 1] as string);
				if (d <= best) continue;
				if (failed(gradeDivergingN({ steps: cand }, { ...p, deutanMin: 0 })).length)
					continue;
				best = d;
				steps = cand;
			}
	return { best, steps };
}
