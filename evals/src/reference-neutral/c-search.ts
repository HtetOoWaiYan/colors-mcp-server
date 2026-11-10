/**
 * Exhaustive searches over all 16,777,216 opaque 8-bit sRGB colors, used to derive and verify the
 * stored optima and feasibility margins of the constraint-search tasks (311) and the subset search
 * of the chart-palette task (312). Written straight from the definitions: WCAG 2 relative luminance
 * on the IEC 61966-2-1 sRGB curve, and Ottosson's Oklab with the sRGB-based M1 matrix.
 * These are slow (a few seconds each), so they run in tests, not at task build time.
 */
import { contrast, deutanDE, hueDist, hueInBand, oklabOfHex, rgbToHex } from "./c-color.js";

const LIN = Float64Array.from({ length: 256 }, (_, i) => {
	const v = i / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});
const lum = (r: number, g: number, b: number) => 0.2126 * (LIN[r] as number) + 0.7152 * (LIN[g] as number) + 0.0722 * (LIN[b] as number);

function oklab(r: number, g: number, b: number): [number, number, number] {
	const R = LIN[r] as number;
	const G = LIN[g] as number;
	const B = LIN[b] as number;
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}
const hueOf = (a: number, b: number) => {
	const h = (Math.atan2(b, a) * 180) / Math.PI;
	return h < 0 ? h + 360 : h;
};
const hexOf = (r: number, g: number, b: number) => rgbToHex([r / 255, g / 255, b / 255]);
const yOfHex = (hex: string) => {
	const n = Number.parseInt(hex.slice(1), 16);
	return lum((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

/** WCAG ratio from two luminances. */
const ratio = (y1: number, y2: number) => (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);

export interface FixResult {
	best: string;
	dist: number;
	/** Colors meeting the contrast target and the hue limit. */
	feasible: number;
	/** Of those, how many are within the grader's distance bound. */
	withinBound: number;
}

/**
 * Smallest Oklab distance to `original` over all colors with WCAG ratio >= target against `bg`
 * and Oklch hue within hueTol of the original's; also counts the colors within factor*opt+slack.
 */
export function bruteFix(bg: string, original: string, target: number, hueTol: number, factor = 2, slack = 0.01): FixResult {
	const yb = yOfHex(bg);
	const o = oklabOfHex(original);
	const oh = hueOf(o[1], o[2]);
	let best = "";
	let dist = Number.POSITIVE_INFINITY;
	const passing: number[] = [];
	for (let r = 0; r < 256; r++)
		for (let g = 0; g < 256; g++)
			for (let b = 0; b < 256; b++) {
				if (ratio(lum(r, g, b), yb) < target) continue;
				const lab = oklab(r, g, b);
				if (hueDist(hueOf(lab[1], lab[2]), oh) > hueTol) continue;
				const d = Math.hypot(lab[0] - o[0], lab[1] - o[1], lab[2] - o[2]);
				if (d < 0.25) passing.push(d);
				if (d < dist) {
					dist = d;
					best = hexOf(r, g, b);
				}
			}
	const bound = factor * dist + slack;
	return { best, dist, feasible: passing.length, withinBound: passing.filter((d) => d <= bound).length };
}

export interface DualResult {
	best: string;
	maxChroma: number;
	/** Number of colors meeting both contrasts and the hue band, with chroma >= floor. */
	countAtFloor: number;
	/** Highest-chroma color that also clears the inner margins (a witness with slack on every constraint). */
	inner: string;
	innerChroma: number;
}

/**
 * Highest Oklch chroma among colors with WCAG ratio >= min against both surfaces and hue in band.
 * `inner` asks for a second answer that clears a stricter ratio and a narrower band.
 */
export function bruteDual(
	light: string,
	dark: string,
	min: number,
	band: [number, number],
	floor: number,
	inner: { min: number; band: [number, number] } = { min, band },
): DualResult {
	const yl = yOfHex(light);
	const yd = yOfHex(dark);
	let best = "";
	let maxChroma = 0;
	let countAtFloor = 0;
	let innerHex = "";
	let innerChroma = 0;
	for (let r = 0; r < 256; r++)
		for (let g = 0; g < 256; g++)
			for (let b = 0; b < 256; b++) {
				const y = lum(r, g, b);
				if (ratio(y, yl) < min || ratio(y, yd) < min) continue;
				const lab = oklab(r, g, b);
				const h = hueOf(lab[1], lab[2]);
				if (!hueInBand(h, band[0], band[1])) continue;
				const c = Math.hypot(lab[1], lab[2]);
				if (c >= floor) countAtFloor++;
				if (c > maxChroma) {
					maxChroma = c;
					best = hexOf(r, g, b);
				}
				if (c > innerChroma && ratio(y, yl) >= inner.min && ratio(y, yd) >= inner.min && hueInBand(h, inner.band[0], inner.band[1])) {
					innerChroma = c;
					innerHex = hexOf(r, g, b);
				}
			}
	return { best, maxChroma, countAtFloor, inner: innerHex, innerChroma };
}

// ---------- 312 chart palette ----------

export function combinations<T>(xs: readonly T[], k: number): T[][] {
	const out: T[][] = [];
	const rec = (start: number, acc: T[]) => {
		if (acc.length === k) {
			out.push([...acc]);
			return;
		}
		for (let i = start; i < xs.length; i++) rec(i + 1, [...acc, xs[i] as T]);
	};
	rec(0, []);
	return out;
}

export function minPairDE(colors: readonly string[], de: (a: string, b: string) => number = deutanDE): number {
	let m = Number.POSITIVE_INFINITY;
	for (let i = 0; i < colors.length; i++)
		for (let j = i + 1; j < colors.length; j++) m = Math.min(m, de(colors[i] as string, colors[j] as string));
	return m;
}

/** Exhaustive best k-subset (max of min pairwise deuteranopia ΔE00) among candidates with contrast >= minContrast. */
export function bestChartSubset(
	candidates: readonly string[],
	bg: string,
	k: number,
	minContrast: number,
	de: (a: string, b: string) => number = deutanDE,
): { best: string[]; score: number; eligible: string[]; scores: number[] } {
	const eligible = candidates.filter((h) => contrast(h, bg) >= minContrast);
	let best: string[] = [];
	let score = -1;
	const scores: number[] = [];
	for (const s of combinations(eligible, k)) {
		const v = minPairDE(s, de);
		scores.push(v);
		if (v > score) {
			score = v;
			best = s;
		}
	}
	return { best, score, eligible, scores };
}
