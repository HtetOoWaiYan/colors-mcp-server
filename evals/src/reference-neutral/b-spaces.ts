/**
 * Author B's own space helpers for categories 305-308: HSL (CSS Color 4 algorithms), CIELAB D65
 * forward and inverse, linear sRGB. Oklab/Oklch and the sRGB transfer curve come from the shared
 * hand-written reference in src/reference/color.ts.
 */
import {
	hexToRgb,
	linearToSrgb,
	type Rgb,
	rgbToHex,
	rgbToLab,
	rgbToOklch,
	srgbToLinear,
	type Vec3,
} from "../reference/color.js";

export type { Rgb, Vec3 };

// ---------- small linear algebra ----------

export type M3 = readonly [Vec3, Vec3, Vec3];

export function mulM(m: M3, v: Vec3): Vec3 {
	return [
		m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
		m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
		m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
	];
}

export function inv3(m: M3): M3 {
	const [[a, b, c], [d, e, f], [g, h, i]] = m;
	const A = e * i - f * h;
	const B = -(d * i - f * g);
	const C = d * h - e * g;
	const det = a * A + b * B + c * C;
	return [
		[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
		[B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
		[C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
	];
}

// ---------- sRGB <-> linear ----------

export const toLinear = (rgb: Rgb): Vec3 => [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
export const fromLinear = (lin: Vec3): Rgb => [linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])];
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const clampRgb = (rgb: Rgb): Rgb => [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
/** Hex of an sRGB triple after simple per-channel clamping. */
export const hexOf = (rgb: Rgb): string => rgbToHex(clampRgb(rgb));

// ---------- CIELAB, D65 white, no adaptation ----------

/** Same matrix and white as src/reference/color.ts (sRGB primaries, D65). */
const RGB_TO_XYZ: M3 = [
	[0.4124564, 0.3575761, 0.1804375],
	[0.2126729, 0.7151522, 0.072175],
	[0.0193339, 0.119192, 0.9503041],
];
const XYZ_TO_RGB = inv3(RGB_TO_XYZ);
const WHITE: Vec3 = [0.95047, 1, 1.08883];
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

export const labOf = (rgb: Rgb): Vec3 => rgbToLab(rgb);
export const labOfHex = (hex: string): Vec3 => rgbToLab(hexToRgb(hex));

export function labToRgb(lab: Vec3): Rgb {
	const [L, a, b] = lab;
	const fy = (L + 16) / 116;
	const fx = fy + a / 500;
	const fz = fy - b / 200;
	const inv = (t: number) => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA);
	const yr = L > KAPPA * EPS ? fy ** 3 : L / KAPPA;
	const xyz: Vec3 = [WHITE[0] * inv(fx), WHITE[1] * yr, WHITE[2] * inv(fz)];
	return fromLinear(mulM(XYZ_TO_RGB, xyz));
}

// ---------- HSL (CSS Color 4) ----------

/** [H degrees 0..360, S 0..1, L 0..1]. Achromatic colors get H = 0 (the hue is powerless). */
export function rgbToHsl(rgb: Rgb): Vec3 {
	const [r, g, b] = rgb;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const L = (max + min) / 2;
	const d = max - min;
	if (d === 0) return [0, 0, L];
	const S = L === 0 || L === 1 ? 0 : (max - L) / Math.min(L, 1 - L);
	let H: number;
	if (max === r) H = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) H = (b - r) / d + 2;
	else H = (r - g) / d + 4;
	return [(H * 60) % 360, S, L];
}

export function hslToRgb(hsl: Vec3): Rgb {
	const h = ((hsl[0] % 360) + 360) % 360;
	const s = hsl[1];
	const l = hsl[2];
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const a = s * Math.min(l, 1 - l);
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return [f(0), f(8), f(4)];
}

export const hslOfHex = (hex: string): Vec3 => rgbToHsl(hexToRgb(hex));

/** Oklch of a hex as [L, C, H]. */
export function oklchOfHex(hex: string): Vec3 {
	const o = rgbToOklch(hexToRgb(hex));
	return [o.L, o.C, o.H];
}

/** Smallest absolute difference between two hue angles (0..180). */
export function hueDist(a: number, b: number): number {
	const d = (((a - b) % 360) + 360) % 360;
	return Math.min(d, 360 - d);
}

/** Largest absolute per-channel difference of two hex colors, in 8-bit steps. */
export function hexChannelDiff(a: string, b: string): number {
	const x = hexToRgb(a);
	const y = hexToRgb(b);
	return Math.round(Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2])) * 255);
}
