// Build-time only: brute-force searches whose results become frozen witnesses and thresholds.
import {
	type DivergingParams,
	type GrayscaleParams,
	gradeDiverging,
	gradePick,
	type HueBand,
	type PickParams,
} from "../../graders-gen/tasks.js";
import {
	contrastRatio,
	deutanDeltaE,
	gamutMapOklch,
	hexToRgb,
	hueDiff,
	inGamut,
	oklchToRgb,
	type Rgb,
	rgbToHex,
	rgbToOklch,
} from "../../reference/color.js";

const failed = (checks: { name: string; pass: boolean }[]) =>
	checks.filter((c) => !c.pass).map((c) => c.name);

function bandHues(b: HueBand, step: number): number[] {
	const span = (((b.max - b.min) % 360) + 360) % 360;
	const out: number[] = [];
	for (let d = 0; d <= span + 1e-9; d += step) out.push((b.min + d) % 360);
	return out;
}

export function candidates(band: HueBand): string[] {
	const seen = new Set<string>();
	for (const H of bandHues(band, 1))
		for (let L = 0.15; L <= 0.985; L += 0.005)
			for (let C = 0; C <= 0.37; C += 0.004) {
				const rgb = oklchToRgb({ L, C, H });
				if (inGamut(rgb, 0)) seen.add(rgbToHex(rgb));
			}
	return [...seen].sort();
}

// Normalized slack of the weakest rule; the witness maximizes it so it sits well inside the feasible region.
function pickSlack(hex: string, p: PickParams): number {
	const c = rgbToOklch(hexToRgb(hex));
	const half = hueDiff(p.hue.min, p.hue.max) / 2;
	const mid = (p.hue.min + half) % 360;
	const s = [(half - hueDiff(c.H, mid)) / 5, (c.C - p.cMin) / 0.02];
	if (p.lMin !== undefined) s.push((c.L - p.lMin) / 0.02);
	if (p.lMax !== undefined) s.push((p.lMax - c.L) / 0.02);
	for (const k of p.contrasts) s.push((contrastRatio(hex, k.against) - k.min) / 0.2);
	return Math.min(...s);
}

export interface PickSearch {
	feasible: number;
	maxChroma: number;
	witness: string;
	witnessSlack: number;
	nearMiss: Record<string, string>;
}

/** Feasibility, the best-slack witness, and for each rule a color that breaks only that rule. */
export function searchPick(p: PickParams): PickSearch {
	const all = candidates({
		min: (p.hue.min - 6 + 360) % 360,
		max: (p.hue.max + 6) % 360,
	});
	let witness = "";
	let best = Number.NEGATIVE_INFINITY;
	let feasible = 0;
	let maxChroma = 0;
	const nearMiss: Record<string, { hex: string; score: number }> = {};
	for (const hex of all) {
		const f = failed(gradePick({ hex }, p));
		const slack = pickSlack(hex, p);
		if (f.length === 0) {
			feasible++;
			maxChroma = Math.max(maxChroma, rgbToOklch(hexToRgb(hex)).C);
			if (slack > best) {
				best = slack;
				witness = hex;
			}
		} else if (f.length === 1) {
			const name = f[0] as string;
			// Prefer a near miss that is otherwise comfortable, so it isolates the one broken rule.
			const others = pickSlackExcept(hex, p, name);
			if (!nearMiss[name] || others > (nearMiss[name]?.score ?? 0))
				nearMiss[name] = { hex, score: others };
		}
	}
	return {
		feasible,
		maxChroma,
		witness,
		witnessSlack: best,
		nearMiss: Object.fromEntries(
			Object.entries(nearMiss).map(([k, v]) => [k, v.hex]),
		),
	};
}

function pickSlackExcept(hex: string, p: PickParams, rule: string): number {
	const q: PickParams = {
		...p,
		contrasts: p.contrasts.filter((c) => `contrast_${c.name}` !== rule),
	};
	if (rule === "lightness_min") q.lMin = undefined;
	if (rule === "lightness_max") q.lMax = undefined;
	if (rule === "chroma_min") q.cMin = -1;
	if (rule === "hue_band") q.hue = { min: 0, max: 359.999 };
	return pickSlack(hex, q);
}

export function maxChromaHex(L: number, H: number, scale = 1): string {
	const m = gamutMapOklch({ L, C: 0.4, H });
	const rgb = oklchToRgb({ L, C: m.oklch.C * scale, H });
	return rgbToHex(rgb.map((v) => Math.min(1, Math.max(0, v))) as unknown as Rgb);
}

// Practical lightness range for a series color: darker than 0.25 reads as black in print.
export const GRAY_BAND: [number, number] = [0.25, 0.97];

// Even spacing across the feasible lightness band gives the best possible minimum gap, gStar.
export function searchGrayscale(
	p: Omit<GrayscaleParams, "lGap">,
): { band: [number, number]; gStar: number; colors: string[] } | null {
	const hues = Array.from({ length: 72 }, (_, i) => i * 5);
	const ok = (hex: string) =>
		contrastRatio(hex, p.background) >= p.minContrast + 0.1 &&
		rgbToOklch(hexToRgb(hex)).C >= p.cMin + 0.02;
	const levels: number[] = [];
	for (let L = GRAY_BAND[0]; L <= GRAY_BAND[1] + 1e-9; L += 0.005)
		if (hues.some((h) => ok(maxChromaHex(L, h, 0.85)))) levels.push(L);
	if (levels.length === 0) return null;
	const lo = levels[0] as number;
	const hi = levels[levels.length - 1] as number;
	const gStar = (hi - lo) / (p.n - 1);
	const span = hi - lo - 0.02;
	const targetL = Array.from(
		{ length: p.n },
		(_, i) => lo + 0.01 + (i * span) / (p.n - 1),
	);
	const chosen: string[] = [];
	const used: number[] = [];
	const assign = (k: number): boolean => {
		if (k === p.n) return true;
		for (const h of hues) {
			if (used.some((u) => hueDiff(u, h) < p.hueGap + 5)) continue;
			const hex = maxChromaHex(targetL[k] as number, h, 0.85);
			if (!ok(hex)) continue;
			chosen.push(hex);
			used.push(h);
			if (assign(k + 1)) return true;
			chosen.pop();
			used.pop();
		}
		return false;
	};
	return assign(0) ? { band: [lo, hi], gStar, colors: [...chosen] } : null;
}

export interface DivergingSearch {
	best: number;
	steps: string[];
}

// Maximizes the ends' deuteranopia separation with every other rule met; the task floor is a fraction of it.
export function searchDiverging(
	p: Omit<DivergingParams, "deutanMin">,
	center: string,
): DivergingSearch {
	const cL = rgbToOklch(hexToRgb(center)).L;
	let best = Number.NEGATIVE_INFINITY;
	let steps: string[] = [];
	const inset = (b: HueBand) => ({
		min: (b.min + 3) % 360,
		max: (b.max - 3 + 360) % 360,
	});
	for (const hA of bandHues(inset(p.hueA), 2.5))
		for (const hB of bandHues(inset(p.hueB), 2.5))
			for (let e = 0.3; e <= p.endLMax - 0.02 + 1e-9; e += 0.02) {
				const Ls = [e, e + (cL - e) / 3, e + (2 * (cL - e)) / 3];
				const side = (h: number) => Ls.map((L) => maxChromaHex(L, h, 0.9));
				const a = side(hA);
				const b = side(hB).reverse();
				const cand = [...a, center, ...b];
				const d = deutanDeltaE(cand[0] as string, cand[6] as string);
				if (d <= best) continue;
				if (failed(gradeDiverging({ steps: cand }, { ...p, deutanMin: 0 })).length)
					continue;
				best = d;
				steps = cand;
			}
	return { best, steps };
}
