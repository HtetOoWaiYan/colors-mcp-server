import { gamutMap, type Rgb, rgbToOklch } from "./color.js";

const MID_LIGHTNESS = 0.96;
const END_LIGHTNESS_MIN = 0.3;
const END_LIGHTNESS_MAX = 0.6;

/** Two ends at one shared lightness, a light neutral middle, symmetric lightness on both sides. */
export function diverging(left: Rgb, right: Rgb, steps: number): Rgb[] {
	const a = rgbToOklch(left);
	const b = rgbToOklch(right);
	const endL = Math.min(
		END_LIGHTNESS_MAX,
		Math.max(END_LIGHTNESS_MIN, Math.min(a.l, b.l)),
	);
	const half = (steps - 1) / 2;
	// from the end color (index 0) toward the middle; chroma fades with f squared so the colors stay colorful until close to the neutral
	const side = (end: { c: number; h: number }): Rgb[] =>
		Array.from({ length: half }, (_, i) => {
			const f = i / half;
			const l = endL + (MID_LIGHTNESS - endL) * f;
			return gamutMap({ l, c: end.c * (1 - f * f), h: end.h }).rgb;
		});
	const mid = gamutMap({ l: MID_LIGHTNESS, c: 0, h: 0 }).rgb;
	return [...side(a), mid, ...side(b).reverse()];
}
