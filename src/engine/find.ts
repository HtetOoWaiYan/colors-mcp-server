import {
	hueDiff,
	inGamut,
	normHue,
	oklchToRgb,
	type Rgb,
	rgbToOklch,
} from "./color.js";
import { contrastRatio, quantize } from "./contrast.js";
import { deltaE2000Lab, rgbToLab } from "./distance.js";
import { type Cvd, simulate } from "./vision.js";

export interface Range {
	min?: number;
	max?: number;
}

export interface FindRules {
	count: number;
	/** Inclusive OKLCH hue band in degrees; wraps through 0 when min > max. */
	hue?: [number, number];
	chroma: Range;
	lightness: Range;
	against: { rgb: Rgb; ratio: number }[];
	minLightnessGap?: number;
	minHueGap?: number;
	minDeltaE?: number;
	cvd: Cvd[];
}

export interface FoundColor {
	rgb: Rgb;
	l: number;
	c: number;
	h: number;
	contrast: number[];
}

export interface PairReport {
	lightnessGap: number;
	hueGap: number | null;
	deltaE: number;
	cvd: Record<string, number>;
}

export type FindResult =
	| { ok: true; colors: FoundColor[]; pair: PairReport | null }
	| { ok: false; reason: string };

type Lab = [number, number, number];
interface Candidate extends FoundColor {
	labs: Lab[];
	slack: number;
}

const CHROMA_CAP = 0.37;
const ACHROMATIC = 0.02;
const DEFAULT_DELTA_E = 15;

const inHue = (h: number, band?: [number, number]): boolean =>
	!band ||
	(band[0] <= band[1]
		? h >= band[0] && h <= band[1]
		: h >= band[0] || h <= band[1]);

function hueGrid(band?: [number, number]): number[] {
	if (!band) return Array.from({ length: 180 }, (_, i) => i * 2);
	const span = band[1] >= band[0] ? band[1] - band[0] : band[1] + 360 - band[0];
	if (span >= 360) return hueGrid();
	const out: number[] = [];
	for (let d = 0; d <= span; d += 2) out.push(normHue(band[0] + d));
	out.push(normHue(band[1]));
	return out;
}

const within = (v: number, r: Range): boolean =>
	(r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);

interface Pool {
	candidates: Candidate[];
	inRange: number;
	bestContrast: number[];
}

function buildPool(r: FindRules): Pool {
	const lmin = r.lightness.min ?? 0.05;
	const lmax = r.lightness.max ?? 0.98;
	const cmin = r.chroma.min ?? 0;
	const cmax = Math.min(r.chroma.max ?? CHROMA_CAP, CHROMA_CAP);
	const views: (Cvd | null)[] = [null, ...r.cvd];
	const bestContrast = r.against.map(() => 0);
	const seen = new Set<number>();
	const candidates: Candidate[] = [];
	let inRange = 0;
	for (const h of hueGrid(r.hue)) {
		for (let l = lmin; l <= lmax + 1e-9; l += 0.01) {
			for (let c = cmin; c <= cmax + 1e-9; c += 0.01) {
				const rgb = oklchToRgb({ l, c, h });
				if (!inGamut(rgb)) continue;
				const q = quantize(rgb);
				const key = q[0] * 255 * 65536 + q[1] * 255 * 256 + q[2] * 255;
				if (seen.has(key)) continue;
				seen.add(key);
				inRange++;
				const contrast = r.against.map((a) => contrastRatio(q, a.rgb));
				contrast.forEach((v, i) => {
					bestContrast[i] = Math.max(bestContrast[i] as number, v);
				});
				if (
					contrast.some((v, i) => v < (r.against[i] as { ratio: number }).ratio)
				)
					continue;
				const o = rgbToOklch(q);
				if (
					!within(o.l, r.lightness) ||
					!within(o.c, r.chroma) ||
					!inHue(o.h, r.hue)
				)
					continue;
				let slack = Number.POSITIVE_INFINITY;
				contrast.forEach((v, i) => {
					slack = Math.min(
						slack,
						v / (r.against[i] as { ratio: number }).ratio,
					);
				});
				if (cmin > 0) slack = Math.min(slack, o.c / cmin);
				candidates.push({
					rgb: q,
					l: o.l,
					c: o.c,
					h: o.h,
					contrast,
					labs: views.map((v) => rgbToLab(v ? simulate(q, v) : q)),
					slack: Number.isFinite(slack) ? slack : 1,
				});
			}
		}
	}
	return { candidates, inRange, bestContrast };
}

function emptyReason(r: FindRules, pool: Pool): string {
	if (pool.inRange === 0)
		return "No sRGB color fits those hue, chroma and lightness ranges together. Lower chromaMin or widen the hue or lightness range.";
	const short = r.against
		.map((a, i) => ({ a, best: pool.bestContrast[i] as number }))
		.filter((x) => x.best < x.a.ratio);
	if (short.length > 0) {
		const parts = short.map(
			(x) =>
				`at most ${x.best.toFixed(2)}:1 against one background (needs ${x.a.ratio}:1)`,
		);
		return `No color in those ranges reaches the contrast you asked for: the best is ${parts.join("; ")}. Relax lightnessMin or lightnessMax, chromaMin, or the ratio.`;
	}
	return "Each contrast rule can be met alone, but no color meets all of them together with the other ranges. Relax one range or one ratio.";
}

function pairSlack(r: FindRules, a: Candidate, b: Candidate): number {
	let s = Number.POSITIVE_INFINITY;
	if (r.minLightnessGap)
		s = Math.min(s, Math.abs(a.l - b.l) / r.minLightnessGap);
	if (r.minHueGap && a.c > ACHROMATIC && b.c > ACHROMATIC)
		s = Math.min(s, hueDiff(a.h, b.h) / r.minHueGap);
	const dE =
		r.minDeltaE ??
		(r.cvd.length > 0 || (!r.minLightnessGap && !r.minHueGap)
			? DEFAULT_DELTA_E
			: undefined);
	if (dE) {
		for (let v = 0; v < a.labs.length; v++)
			s = Math.min(s, deltaE2000Lab(a.labs[v] as Lab, b.labs[v] as Lab) / dE);
	}
	return s;
}

const setSlack = (r: FindRules, set: Candidate[]): number => {
	let m = Math.min(...set.map((c) => c.slack));
	for (let i = 0; i < set.length; i++)
		for (let j = i + 1; j < set.length; j++)
			m = Math.min(m, pairSlack(r, set[i] as Candidate, set[j] as Candidate));
	return m;
};

/** Keeps the best two candidates per hue and lightness bucket so set search stays fast. */
function thin(cands: Candidate[]): Candidate[] {
	const buckets = new Map<string, Candidate[]>();
	for (const c of cands) {
		const key = `${Math.round(c.h / 15)}:${Math.round(c.l / 0.05)}`;
		const list = buckets.get(key) ?? [];
		list.push(c);
		buckets.set(key, list);
	}
	const out: Candidate[] = [];
	for (const list of buckets.values())
		out.push(...list.sort((a, b) => b.slack - a.slack).slice(0, 2));
	return out;
}

function searchSet(r: FindRules, pool: Candidate[]): Candidate[] | null {
	const starts = [...pool].sort((a, b) => b.slack - a.slack).slice(0, 6);
	let best: Candidate[] | null = null;
	let bestScore = -1;
	for (const start of starts) {
		const set = [start];
		while (set.length < r.count) {
			let pick: Candidate | null = null;
			let pickScore = -1;
			for (const c of pool) {
				if (set.includes(c)) continue;
				const s = Math.min(c.slack, ...set.map((x) => pairSlack(r, c, x)));
				if (s > pickScore) {
					pickScore = s;
					pick = c;
				}
			}
			if (!pick) break;
			set.push(pick);
		}
		if (set.length < r.count) continue;
		let score = setSlack(r, set);
		for (let pass = 0; pass < 5; pass++) {
			let improved = false;
			for (let i = 0; i < set.length; i++) {
				for (const c of pool) {
					if (set.includes(c)) continue;
					const trial = [...set.slice(0, i), c, ...set.slice(i + 1)];
					const s = setSlack(r, trial);
					if (s > score + 1e-9) {
						set[i] = c;
						score = s;
						improved = true;
					}
				}
			}
			if (!improved) break;
		}
		if (score > bestScore) {
			bestScore = score;
			best = [...set];
		}
	}
	return best;
}

function pairReport(r: FindRules, set: Candidate[]): PairReport {
	let lightnessGap = Number.POSITIVE_INFINITY;
	let hueGap: number | null = null;
	let deltaE = Number.POSITIVE_INFINITY;
	const cvd: Record<string, number> = {};
	for (const v of r.cvd) cvd[v] = Number.POSITIVE_INFINITY;
	for (let i = 0; i < set.length; i++) {
		for (let j = i + 1; j < set.length; j++) {
			const a = set[i] as Candidate;
			const b = set[j] as Candidate;
			lightnessGap = Math.min(lightnessGap, Math.abs(a.l - b.l));
			if (a.c > ACHROMATIC && b.c > ACHROMATIC)
				hueGap = Math.min(hueGap ?? 360, hueDiff(a.h, b.h));
			deltaE = Math.min(
				deltaE,
				deltaE2000Lab(a.labs[0] as Lab, b.labs[0] as Lab),
			);
			r.cvd.forEach((v, k) => {
				cvd[v] = Math.min(
					cvd[v] as number,
					deltaE2000Lab(a.labs[k + 1] as Lab, b.labs[k + 1] as Lab),
				);
			});
		}
	}
	return { lightnessGap, hueGap, deltaE, cvd };
}

export function findColors(r: FindRules): FindResult {
	const pool = buildPool(r);
	if (pool.candidates.length === 0)
		return { ok: false, reason: emptyReason(r, pool) };
	const byBest = [...pool.candidates].sort(
		(a, b) => b.slack - a.slack || b.c - a.c,
	);
	if (r.count === 1) {
		const c = byBest[0] as Candidate;
		return { ok: true, colors: [c], pair: null };
	}
	const set = searchSet(r, thin(pool.candidates));
	if (!set)
		return { ok: false, reason: "Could not assemble that many colors." };
	const report = pairReport(r, set);
	const slack = setSlack(r, set);
	if (slack < 1 - 1e-9) {
		const bits = [
			r.minLightnessGap
				? `lightness gap ${report.lightnessGap.toFixed(3)} (needs ${r.minLightnessGap})`
				: null,
			r.minHueGap && report.hueGap !== null
				? `hue gap ${report.hueGap.toFixed(0)} degrees (needs ${r.minHueGap})`
				: null,
			`color difference ${report.deltaE.toFixed(1)}`,
		].filter(Boolean);
		return {
			ok: false,
			reason: `No set of ${r.count} colors meets every rule at once. The closest set has ${bits.join(", ")}. Ask for fewer colors, or relax the gaps, the ranges or the contrast.`,
		};
	}
	const sorted = [...set].sort((a, b) => a.l - b.l);
	return { ok: true, colors: sorted, pair: report };
}
