/**
 * Author C's v3 reference additions (categories 309-312), written from the published definitions:
 * - exhaustive searches over all 16,777,216 opaque 8-bit sRGB colors for the v3 constraint-search
 *   tasks: the closest color to an original under several WCAG 2 contrast floors at once, and the
 *   highest Oklch chroma under several contrast floors inside a hue band (WCAG 2 relative luminance
 *   on the IEC 61966-2-1 curve, Ottosson's Oklab with the sRGB-based M1 matrix);
 * - the k-subset chart search with several backgrounds, plus the exact share of random picks that
 *   would pass (how much a lucky guess is worth);
 * - CSS color syntax used in the v3 audit prompts: rgb() with 0-255 numbers, hsl() (CSS Color 4
 *   hsl-to-rgb), #rgb, and source-over alpha compositing on gamma-encoded sRGB (CSS Compositing 1);
 * - CIE 1976 ΔE*ab on the same D65 CIELAB as CIEDE2000 (the wrong-metric trap in a near-duplicate audit).
 * These run in tests and at build time only where they are fast; the 16.7M-color loops run in tests.
 */
import { contrastRatioRgb, hexToRgb, type Rgb, rgbToHex, rgbToLab, type Vec3 } from "../reference/color.js";
import { deutanDE, hueDist, hueInBand, oklabOfHex } from "./c-color.js";
import { combinations } from "./c-search.js";

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
	const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v * 255)) as [number, number, number];
	return lum(r, g, b);
};
const ratio = (y1: number, y2: number) => (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);

export interface Floor {
	bg: string;
	min: number;
}

export interface FixMultiResult {
	best: string;
	dist: number;
	/** Colors meeting every contrast floor and the hue limit. */
	feasible: number;
	/** Distances (ascending) of the feasible colors closer than `keep` to the original. */
	near: number[];
}

/**
 * Smallest Oklab distance to `original` over all opaque 8-bit colors meeting every contrast floor and
 * with Oklch hue within hueTol of the original's. `near` keeps the sorted distances below `keep`, so
 * the caller can count how many colors any proposed bound admits.
 */
export function bruteFixMulti(original: string, floors: Floor[], hueTol: number, keep = 0.3): FixMultiResult {
	const ys = floors.map((f) => yOfHex(f.bg));
	const o = oklabOfHex(original);
	const oh = hueOf(o[1], o[2]);
	let best = "";
	let dist = Number.POSITIVE_INFINITY;
	let feasible = 0;
	const near: number[] = [];
	for (let r = 0; r < 256; r++)
		for (let g = 0; g < 256; g++)
			for (let b = 0; b < 256; b++) {
				const y = lum(r, g, b);
				let ok = true;
				for (let i = 0; i < ys.length; i++)
					if (ratio(y, ys[i] as number) < (floors[i] as Floor).min) {
						ok = false;
						break;
					}
				if (!ok) continue;
				const lab = oklab(r, g, b);
				if (hueDist(hueOf(lab[1], lab[2]), oh) > hueTol) continue;
				feasible++;
				const d = Math.hypot(lab[0] - o[0], lab[1] - o[1], lab[2] - o[2]);
				if (d < keep) near.push(d);
				if (d < dist) {
					dist = d;
					best = hexOf(r, g, b);
				}
			}
	near.sort((a, b) => a - b);
	return { best, dist, feasible, near };
}

export interface ChromaMaxResult {
	best: string;
	maxChroma: number;
	/** Colors meeting every floor and the band with chroma >= `floor`. */
	countAtFloor: number;
	/** Highest-chroma color that also clears the stricter `inner` floors and band (slack on every rule). */
	inner: string;
	innerChroma: number;
}

/** Highest Oklch chroma among colors meeting every contrast floor with hue inside the band. */
export function bruteChromaMax(
	floors: Floor[],
	band: [number, number],
	floor: number,
	inner: { mins: number[]; band: [number, number] },
): ChromaMaxResult {
	const ys = floors.map((f) => yOfHex(f.bg));
	let best = "";
	let maxChroma = 0;
	let countAtFloor = 0;
	let innerHex = "";
	let innerChroma = 0;
	for (let r = 0; r < 256; r++)
		for (let g = 0; g < 256; g++)
			for (let b = 0; b < 256; b++) {
				const y = lum(r, g, b);
				let ok = true;
				let innerOk = true;
				for (let i = 0; i < ys.length; i++) {
					const q = ratio(y, ys[i] as number);
					if (q < (floors[i] as Floor).min) {
						ok = false;
						break;
					}
					if (q < (inner.mins[i] as number)) innerOk = false;
				}
				if (!ok) continue;
				const lab = oklab(r, g, b);
				const h = hueOf(lab[1], lab[2]);
				if (!hueInBand(h, band[0], band[1])) continue;
				const c = Math.hypot(lab[1], lab[2]);
				if (c >= floor) countAtFloor++;
				if (c > maxChroma) {
					maxChroma = c;
					best = hexOf(r, g, b);
				}
				if (innerOk && c > innerChroma && hueInBand(h, inner.band[0], inner.band[1])) {
					innerChroma = c;
					innerHex = hexOf(r, g, b);
				}
			}
	return { best, maxChroma, countAtFloor, inner: innerHex, innerChroma };
}

// ---------- 312 chart palette with several backgrounds ----------

export interface ChartSearch {
	eligible: string[];
	best: string[];
	score: number;
	/** Number of k-subsets of the eligible candidates. */
	subsets: number;
	/** Of those, how many score at least `threshold`. */
	passing: number;
	/** Share of all k-subsets of the full candidate list that pass every rule (a uniformly random pick). */
	randomPassRate: number;
}

/** Exhaustive best k-subset (max of min pairwise deutan ΔE00) among candidates clearing minContrast on every background. */
export function chartSearch(
	candidates: string[],
	backgrounds: string[],
	minContrast: number,
	k: number,
	ratioOfBest: number,
	de: (a: string, b: string) => number = deutanDE,
): ChartSearch & { threshold: number } {
	const eligible = candidates.filter((c) => backgrounds.every((b) => contrastRatioRgb(hexToRgb(c), hexToRgb(b)) >= minContrast));
	const dist = new Map<string, number>();
	for (let i = 0; i < eligible.length; i++)
		for (let j = i + 1; j < eligible.length; j++) dist.set(`${i}|${j}`, de(eligible[i] as string, eligible[j] as string));
	const idx = eligible.map((_, i) => i);
	const scored = combinations(idx, k).map((s) => {
		let m = Number.POSITIVE_INFINITY;
		for (let a = 0; a < s.length; a++)
			for (let b = a + 1; b < s.length; b++) m = Math.min(m, dist.get(`${s[a]}|${s[b]}`) as number);
		return { s, m };
	});
	let best = scored[0] as { s: number[]; m: number };
	for (const x of scored) if (x.m > best.m) best = x;
	const threshold = ratioOfBest * best.m;
	const passing = scored.filter((x) => x.m >= threshold).length;
	const total = combinations(candidates, k).length;
	return {
		eligible,
		best: best.s.map((i) => eligible[i] as string),
		score: best.m,
		threshold,
		subsets: scored.length,
		passing,
		randomPassRate: passing / total,
	};
}

// ---------- CSS color syntax used in the audit prompts ----------

/** CSS Color 4 hslToRgb (h in degrees, s and l in 0..1), returning encoded sRGB in 0..1. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const a = s * Math.min(l, 1 - l);
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return [f(0), f(8), f(4)];
}

/** Parses the subset of CSS color syntax the prompts use: #rgb, #rrggbb, rgb(r g b) / rgb(r, g, b) with 0-255 numbers, hsl(h s% l%) / hsl(h, s%, l%). */
export function parseCssColor(s: string): Rgb {
	const t = s.trim().toLowerCase();
	if (t.startsWith("#")) return hexToRgb(t);
	const m = /^(rgb|hsl)\(\s*([^)]*)\)$/.exec(t);
	if (!m) throw new Error(`unsupported color ${s}`);
	const parts = (m[2] as string).split(/[\s,]+/).filter(Boolean);
	if (parts.length !== 3) throw new Error(`bad color ${s}`);
	if (m[1] === "rgb") return parts.map((p) => Number(p) / 255) as unknown as Rgb;
	const [h, sat, l] = parts.map((p) => Number.parseFloat(p)) as [number, number, number];
	return hslToRgb(h, sat / 100, l / 100);
}

/** Source-over: an sRGB color with alpha over an opaque background, blended on the gamma-encoded values (CSS). */
export const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb =>
	[0, 1, 2].map((i) => (fg[i] as number) * alpha + (bg[i] as number) * (1 - alpha)) as unknown as Rgb;

// ---------- ΔE*ab (the wrong-metric trap) ----------

export const de76Hex = (a: string, b: string): number => {
	const p: Vec3 = rgbToLab(hexToRgb(a));
	const q: Vec3 = rgbToLab(hexToRgb(b));
	return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
