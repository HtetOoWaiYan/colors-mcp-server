// Luminance along an sRGB-blended segment is convex in position, so its maximum sits at a stop and its minimum can fall between stops.
import { hexToRgb, relativeLuminance, type Rgb } from "../reference/color.js";

export function blendAt(a: string, b: string, t: number): Rgb {
	const A = hexToRgb(a);
	const B = hexToRgb(b);
	return [0, 1, 2].map(
		(k) => (A[k] as number) + t * ((B[k] as number) - (A[k] as number)),
	) as unknown as Rgb;
}

const lumAt = (a: string, b: string, t: number) =>
	relativeLuminance(blendAt(a, b, t));

/** Minimum luminance on one segment: coarse scan, then golden-section on the bracket (the function is convex). */
export function segmentMinLuminance(a: string, b: string): number {
	const N = 256;
	let best = 0;
	for (let i = 1; i <= N; i++)
		if (lumAt(a, b, i / N) < lumAt(a, b, best / N)) best = i;
	let lo = Math.max(0, (best - 1) / N);
	let hi = Math.min(1, (best + 1) / N);
	const g = (Math.sqrt(5) - 1) / 2;
	for (let i = 0; i < 80; i++) {
		const x1 = hi - g * (hi - lo);
		const x2 = lo + g * (hi - lo);
		if (lumAt(a, b, x1) <= lumAt(a, b, x2)) hi = x2;
		else lo = x1;
	}
	return Math.min(lumAt(a, b, (lo + hi) / 2), lumAt(a, b, 0), lumAt(a, b, 1));
}

// The range depends only on the stops, and a build-time search grades thousands of answers against one gradient.
const rangeCache = new Map<string, { min: number; max: number }>();

export function gradientLuminanceRange(stops: readonly string[]): {
	min: number;
	max: number;
} {
	const key = stops.join(",");
	const hit = rangeCache.get(key);
	if (hit) return hit;
	const r = computeRange(stops);
	rangeCache.set(key, r);
	return r;
}

function computeRange(stops: readonly string[]): { min: number; max: number } {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < stops.length; i++) {
		max = Math.max(max, relativeLuminance(hexToRgb(stops[i] as string)));
		if (i > 0)
			min = Math.min(
				min,
				segmentMinLuminance(stops[i - 1] as string, stops[i] as string),
			);
	}
	if (stops.length === 1) min = max;
	return { min, max };
}

const ratio = (y1: number, y2: number) =>
	(Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);

/** Lowest WCAG 2 contrast of text against any point of the gradient (1 when the text luminance falls inside the gradient's range). */
export function gradientMinContrast(
	text: string,
	stops: readonly string[],
): number {
	const yt = relativeLuminance(hexToRgb(text));
	const { min, max } = gradientLuminanceRange(stops);
	if (yt >= min && yt <= max) return 1;
	return ratio(yt, yt < min ? min : max);
}

/** Lowest contrast against the stops alone: the common shortcut that misses a dip between stops. */
export function stopsMinContrast(text: string, stops: readonly string[]): number {
	const yt = relativeLuminance(hexToRgb(text));
	return Math.min(
		...stops.map((s) => ratio(yt, relativeLuminance(hexToRgb(s)))),
	);
}
