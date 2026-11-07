// Channels are 0..255 floats left unrounded, so a grader can tell an ambiguous .5 rounding from a wrong answer.
import {
	contrastRatio,
	hexToRgb,
	linearToSrgb,
	oklabToRgb,
	rgbToHex,
	rgbToOklab,
	srgbToLinear,
	type Vec3,
} from "../reference/color.js";

export type Rgb8 = readonly [number, number, number];

// An answer channel n matches an unrounded value v when |n - v| <= 0.6: exact rounding, plus both neighbours when v is within 0.1 of a .5 tie.
export const ROUND_TOL = 0.6;

// Parsed from the normalized string, so channels are exact integers.
export function hexToRgb8(hex: string): Rgb8 {
	const n = rgbToHex(hexToRgb(hex));
	return [1, 3, 5].map((i) =>
		Number.parseInt(n.slice(i, i + 2), 16),
	) as unknown as Rgb8;
}

export const round8 = (c: Rgb8): Rgb8 =>
	c.map((v) => Math.min(255, Math.max(0, Math.round(v)))) as unknown as Rgb8;

export const rgb8ToHex = (c: Rgb8): string =>
	`#${round8(c)
		.map((v) => v.toString(16).padStart(2, "0"))
		.join("")}`;

export function channelMatches(n: unknown, v: number): boolean {
	return (
		typeof n === "number" && Number.isInteger(n) && Math.abs(n - v) <= ROUND_TOL
	);
}

/** CSS source-over on non-linear sRGB values: alpha*fg + (1-alpha)*bg per channel. */
export function over8(fg: Rgb8, alpha: number, bg: Rgb8): Rgb8 {
	return [0, 1, 2].map(
		(k) => alpha * (fg[k] as number) + (1 - alpha) * (bg[k] as number),
	) as unknown as Rgb8;
}

/** Weight t of `b` (t = 0.5 is an even mix), interpolated on encoded sRGB values. */
export function mixSrgb8(a: Rgb8, b: Rgb8, t: number): Rgb8 {
	return over8(b, t, a);
}

export function mixLinear8(a: Rgb8, b: Rgb8, t: number): Rgb8 {
	return [0, 1, 2].map((k) => {
		const la = srgbToLinear((a[k] as number) / 255);
		const lb = srgbToLinear((b[k] as number) / 255);
		return linearToSrgb(la * (1 - t) + lb * t) * 255;
	}) as unknown as Rgb8;
}

/** Interpolates Oklab L, a, b; the result is not clipped, so callers can reject out-of-gamut mixes. */
export function mixOklab8(a: Rgb8, b: Rgb8, t: number): Rgb8 {
	const la = rgbToOklab(a.map((v) => v / 255) as unknown as Vec3);
	const lb = rgbToOklab(b.map((v) => v / 255) as unknown as Vec3);
	const m = [0, 1, 2].map(
		(k) => (la[k] as number) * (1 - t) + (lb[k] as number) * t,
	) as unknown as Vec3;
	return oklabToRgb(m).map((v) => v * 255) as unknown as Rgb8;
}

/** Contrast of text over a photo region under a scrim, the composite rounded to 8-bit first (as a browser paints it). */
export function scrimContrast(
	text: string,
	scrim: string,
	alpha: number,
	region: string,
): number {
	const c = over8(hexToRgb8(scrim), alpha, hexToRgb8(region));
	return contrastRatio(text, rgb8ToHex(c));
}

/** Same as scrimContrast without the 8-bit rounding, used only to confirm a task's margins. */
export function scrimContrastExact(
	text: string,
	scrim: string,
	alpha: number,
	region: string,
): number {
	const c = over8(hexToRgb8(scrim), alpha, hexToRgb8(region));
	const lin = c.map((v) => srgbToLinear(v / 255));
	const y =
		0.2126 * (lin[0] as number) +
		0.7152 * (lin[1] as number) +
		0.0722 * (lin[2] as number);
	const t = hexToRgb(text).map(srgbToLinear);
	const yt =
		0.2126 * (t[0] as number) +
		0.7152 * (t[1] as number) +
		0.0722 * (t[2] as number);
	return (Math.max(y, yt) + 0.05) / (Math.min(y, yt) + 0.05);
}

export function minScrimOpacity(
	text: string,
	scrim: string,
	regions: readonly string[],
	target: number,
	step: number,
): number | null {
	const n = Math.round(1 / step);
	for (let i = 0; i <= n; i++) {
		const a = Math.round(i * step * 1e6) / 1e6;
		if (regions.every((r) => scrimContrast(text, scrim, a, r) >= target))
			return a;
	}
	return null;
}
