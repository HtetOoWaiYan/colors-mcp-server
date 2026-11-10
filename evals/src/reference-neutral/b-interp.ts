/**
 * Two-color interpolation in a named space, following CSS Color 4 section 12 (non-premultiplied, no
 * alpha): convert both colors to the space, fix up the hue angles by the stated arc rule, interpolate
 * every component linearly, convert back. Results are returned unclamped; callers clamp per channel.
 */
import { hexToRgb, oklabToRgb, rgbToOklab, type Vec3 } from "../reference/color.js";
import { fromLinear, hslToRgb, labOf, labToRgb, type Rgb, rgbToHsl, toLinear } from "./b-spaces.js";

export type Space = "srgb" | "srgb-linear" | "oklab" | "oklch" | "lab" | "hsl";
export type HueRule = "shorter" | "longer" | "increasing" | "decreasing";
export const SPACES: readonly Space[] = ["srgb", "srgb-linear", "oklab", "oklch", "lab", "hsl"];

function toPolar(lab: Vec3): Vec3 {
	let h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
	if (h < 0) h += 360;
	return [lab[0], Math.hypot(lab[1], lab[2]), h];
}
function fromPolar(lch: Vec3): Vec3 {
	const r = (lch[2] * Math.PI) / 180;
	return [lch[0], lch[1] * Math.cos(r), lch[1] * Math.sin(r)];
}

export function toSpace(rgb: Rgb, space: Space): Vec3 {
	switch (space) {
		case "srgb":
			return [...rgb] as unknown as Vec3;
		case "srgb-linear":
			return toLinear(rgb);
		case "oklab":
			return rgbToOklab(rgb);
		case "oklch":
			return toPolar(rgbToOklab(rgb));
		case "lab":
			return labOf(rgb);
		case "hsl":
			return rgbToHsl(rgb);
	}
}

export function fromSpace(c: Vec3, space: Space): Rgb {
	switch (space) {
		case "srgb":
			return c;
		case "srgb-linear":
			return fromLinear(c);
		case "oklab":
			return oklabToRgb(c);
		case "oklch":
			return oklabToRgb(fromPolar(c));
		case "lab":
			return labToRgb(c);
		case "hsl":
			return hslToRgb(c);
	}
}

const HUE_INDEX: Partial<Record<Space, number>> = { oklch: 2, hsl: 0 };

/** CSS Color 4 hue fix-up (section 12.4). */
export function fixupHues(h1: number, h2: number, rule: HueRule): [number, number] {
	const d = h2 - h1;
	switch (rule) {
		case "shorter":
			if (d > 180) return [h1 + 360, h2];
			if (d < -180) return [h1, h2 + 360];
			return [h1, h2];
		case "longer":
			if (d > 0 && d < 180) return [h1 + 360, h2];
			if (d > -180 && d <= 0) return [h1, h2 + 360];
			return [h1, h2];
		case "increasing":
			return h2 < h1 ? [h1, h2 + 360] : [h1, h2];
		case "decreasing":
			return h1 < h2 ? [h1 + 360, h2] : [h1, h2];
	}
}

/** Color at progress t (0 = a, 1 = b), unclamped sRGB. */
export function interpolate(a: Rgb, b: Rgb, t: number, space: Space, rule: HueRule = "shorter"): Rgb {
	const ca = [...toSpace(a, space)];
	const cb = [...toSpace(b, space)];
	const hi = HUE_INDEX[space];
	if (hi !== undefined) {
		const [h1, h2] = fixupHues(ca[hi] as number, cb[hi] as number, rule);
		ca[hi] = h1;
		cb[hi] = h2;
	}
	const out = ca.map((v, i) => v + ((cb[i] as number) - v) * t) as unknown as Vec3;
	if (hi !== undefined) (out as unknown as number[])[hi] = (((out[hi] as number) % 360) + 360) % 360;
	return fromSpace(out, space);
}

export const interpolateHex = (a: string, b: string, t: number, space: Space, rule: HueRule = "shorter"): Rgb =>
	interpolate(hexToRgb(a), hexToRgb(b), t, space, rule);

/** N evenly spaced stops, endpoints included. */
export function stops(a: string, b: string, n: number, space: Space, rule: HueRule = "shorter"): Rgb[] {
	return Array.from({ length: n }, (_, i) => interpolateHex(a, b, i / (n - 1), space, rule));
}

/** Multi-stop gradient: stops sorted by position (0..1); samples at position p by piecewise interpolation. */
export function sampleGradient(
	gstops: readonly { color: string; pos: number }[],
	p: number,
	space: Space,
	rule: HueRule = "shorter",
): Rgb {
	for (let i = 0; i < gstops.length - 1; i++) {
		const s0 = gstops[i] as { color: string; pos: number };
		const s1 = gstops[i + 1] as { color: string; pos: number };
		if (p <= s1.pos || i === gstops.length - 2) {
			const t = (p - s0.pos) / (s1.pos - s0.pos);
			return interpolateHex(s0.color, s1.color, t, space, rule);
		}
	}
	throw new Error("gradient needs at least two stops");
}

/** Largest overshoot outside [0,1] of any channel (0 when in gamut). */
export const gamutExcess = (rgb: Rgb): number => Math.max(0, ...rgb.map((v) => Math.max(v - 1, -v)));
