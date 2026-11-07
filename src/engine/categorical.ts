import { gamutMap, type Rgb, rgbToOklab } from "./color.js";
import { contrastRatio, quantize } from "./contrast.js";
import { deltaE2000Lab, rgbToLab } from "./distance.js";
import { type Cvd, minSeparation, simulate } from "./vision.js";

export interface CategoricalOptions {
	background: Rgb;
	cvd: Cvd[];
	minContrast: number;
	minNormalSeparation: number;
}

export interface CategoricalResult {
	colors: Rgb[];
	separation: Record<string, number>;
}

type Lab = [number, number, number];
interface Candidate {
	rgb: Rgb;
	labs: Lab[];
}

function candidatePool(o: CategoricalOptions): Candidate[] {
	const views: (Cvd | null)[] = [null, ...o.cvd];
	const make = (rgb: Rgb): Candidate | null => {
		const q = quantize(rgb);
		if (contrastRatio(q, o.background) < o.minContrast) return null;
		return { rgb: q, labs: views.map((v) => rgbToLab(v ? simulate(q, v) : q)) };
	};
	const pool: Candidate[] = [];
	const seen = new Set<string>();
	const add = (rgb: Rgb) => {
		const key = quantize(rgb).join(",");
		if (seen.has(key)) return;
		seen.add(key);
		const c = make(rgb);
		if (c) pool.push(c);
	};
	for (let li = 0; li <= 12; li++) {
		const l = 0.3 + li * 0.05;
		for (const c of [0.06, 0.12, 0.18, 0.25]) {
			for (let h = 0; h < 360; h += 12) add(gamutMap({ l, c, h }).rgb);
		}
	}
	// neutrals are useful anchors when vision types collapse hues
	for (let l = 0.1; l <= 0.95; l += 0.1) add(gamutMap({ l, c: 0, h: 0 }).rgb);
	return pool;
}

const worst = (a: Candidate, b: Candidate): number => {
	let m = Number.POSITIVE_INFINITY;
	for (let v = 0; v < a.labs.length; v++)
		m = Math.min(m, deltaE2000Lab(a.labs[v] as Lab, b.labs[v] as Lab));
	return m;
};

// Greedy max-min start, then swaps while the weakest pair improves; the pool's lightness range keeps picks from going near-black.
export function categorical(
	n: number,
	o: CategoricalOptions,
): CategoricalResult | null {
	const pool = candidatePool(o);
	const normalGap = (a: Candidate, b: Candidate) =>
		deltaE2000Lab(a.labs[0] as Lab, b.labs[0] as Lab);
	// start from the most chromatic candidate for a lively first color
	const chroma = (c: Candidate) => {
		const [, a, b] = rgbToOklab(c.rgb);
		return Math.hypot(a, b);
	};
	const first = [...pool].sort((a, b) => chroma(b) - chroma(a))[0];
	if (!first) return null;
	const chosen: Candidate[] = [first];
	while (chosen.length < n) {
		let best: Candidate | null = null;
		let bestScore = -1;
		for (const c of pool) {
			if (chosen.some((x) => normalGap(c, x) < o.minNormalSeparation)) continue;
			const score = Math.min(...chosen.map((x) => worst(c, x)));
			if (score > bestScore) {
				bestScore = score;
				best = c;
			}
		}
		if (!best) return null;
		chosen.push(best);
	}
	const setScore = (set: Candidate[]) => {
		let m = Number.POSITIVE_INFINITY;
		for (let i = 0; i < set.length; i++) {
			for (let j = i + 1; j < set.length; j++)
				m = Math.min(m, worst(set[i] as Candidate, set[j] as Candidate));
		}
		return m;
	};
	let score = setScore(chosen);
	for (let pass = 0; pass < 6; pass++) {
		let improved = false;
		for (let i = 0; i < chosen.length; i++) {
			const others = chosen.filter((_, k) => k !== i);
			for (const c of pool) {
				if (others.some((x) => normalGap(c, x) < o.minNormalSeparation))
					continue;
				const s = setScore([...others, c]);
				if (s > score + 1e-6) {
					chosen[i] = c;
					score = s;
					improved = true;
				}
			}
		}
		if (!improved) break;
	}
	const colors = chosen.map((c) => c.rgb);
	const separation: Record<string, number> = {
		normal: minSeparation(colors, null).min,
	};
	for (const v of o.cvd) separation[v] = minSeparation(colors, v).min;
	return { colors, separation };
}
