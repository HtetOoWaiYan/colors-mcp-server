import {
	gamutMap,
	hueDiff,
	okDistance,
	type Rgb,
	rgbToOklab,
	rgbToOklch,
} from "./color.js";
import { contrastRatio, quantize } from "./contrast.js";

export interface FixResult {
	rgb: Rgb;
	ratio: number;
	distance: number;
	changed: boolean;
}

const MAX_HUE_DRIFT = 15;
const HUE_MIN_CHROMA = 0.04;
const NEUTRAL_CHROMA = 0.01;

// Coarse search, then an exact local search over neighbouring 8-bit values, so the result is a true local optimum of the hex lattice.
export function fixContrast(
	fg: Rgb,
	bg: Rgb,
	target: number,
	keepHue = true,
): FixResult | null {
	const start = quantize(fg);
	const startRatio = contrastRatio(start, bg);
	if (startRatio >= target)
		return { rgb: start, ratio: startRatio, distance: 0, changed: false };

	const orig = rgbToOklch(fg);
	const origLab = rgbToOklab(fg);
	const constrained = keepHue && orig.c >= HUE_MIN_CHROMA;

	const evaluate = (rgb: Rgb): number | null => {
		const q = quantize(rgb);
		if (contrastRatio(q, bg) < target) return null;
		if (constrained && hueDiff(orig.h, rgbToOklch(q).h) > MAX_HUE_DRIFT)
			return null;
		return okDistance(origLab, rgbToOklab(q));
	};

	// A gray stays a gray: for an (almost) neutral input only R=G=B colors are candidates.
	if (orig.c < NEUTRAL_CHROMA) {
		let bestGray: Rgb | null = null;
		let bestGrayD = Number.POSITIVE_INFINITY;
		for (let v = 0; v <= 255; v++) {
			const g: Rgb = [v / 255, v / 255, v / 255];
			if (contrastRatio(g, bg) < target) continue;
			const d = okDistance(origLab, rgbToOklab(g));
			if (d < bestGrayD) {
				bestGrayD = d;
				bestGray = g;
			}
		}
		if (bestGray) {
			return {
				rgb: bestGray,
				ratio: contrastRatio(bestGray, bg),
				distance: bestGrayD,
				changed: true,
			};
		}
	}

	let best: Rgb | null = null;
	let bestD = Number.POSITIVE_INFINITY;
	const consider = (rgb: Rgb) => {
		const d = evaluate(rgb);
		if (d !== null && d < bestD) {
			bestD = d;
			best = quantize(rgb);
		}
	};

	for (let li = 0; li <= 200; li++) {
		const l = li / 200;
		for (let ci = 0; ci <= 24; ci++) {
			consider(gamutMap({ l, c: (orig.c * ci) / 24, h: orig.h }).rgb);
		}
	}
	if (!best) return null;

	for (let round = 0; round < 4; round++) {
		const base: Rgb = best;
		const before = bestD;
		for (let dr = -3; dr <= 3; dr++) {
			for (let dg = -3; dg <= 3; dg++) {
				for (let db = -3; db <= 3; db++) {
					consider([
						base[0] + dr / 255,
						base[1] + dg / 255,
						base[2] + db / 255,
					]);
				}
			}
		}
		if (bestD >= before) break;
	}
	const rgb = best as Rgb;
	return { rgb, ratio: contrastRatio(rgb, bg), distance: bestD, changed: true };
}
