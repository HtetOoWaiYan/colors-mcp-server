/**
 * Author C's reference math for categories 309-312 (tonal-scale, role-tokens, constraint-search,
 * palette-audit). WCAG 2 contrast, Oklab/Oklch, CIEDE2000 and the Machado 2009 deuteranopia matrix
 * come from the shared hand-written src/reference/color.ts (cross-checked in c-color.test.ts
 * against published vectors and colorjs.io). What is new here is written from the published
 * definitions:
 * - Display P3 -> sRGB: RGB->XYZ matrices derived from the primaries' chromaticities and the D65
 *   white point (SMPTE EG 432-1 / CSS Color 4 for P3, IEC 61966-2-1 for sRGB), both with the sRGB
 *   transfer curve.
 * - Gamut mapping by Oklch chroma reduction at constant L and h (bisection on C).
 */
import {
	contrastRatio,
	deltaE2000,
	hexToRgb,
	linearToSrgb,
	type Oklch,
	oklabToOklch,
	oklabToRgb,
	oklchToOklab,
	type Rgb,
	rgbToHex,
	rgbToLab,
	rgbToOklab,
	simulateDeuteranopia,
	srgbToLinear,
	type Vec3,
} from "../reference/color.js";

export type { Oklch, Rgb, Vec3 };
export { contrastRatio, hexToRgb, rgbToHex };

type M3 = [Vec3, Vec3, Vec3];

const mulM = (m: M3, v: Vec3): Vec3 => [
	m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
	m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
	m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const mulMM = (a: M3, b: M3): M3 => {
	const col = (j: number): Vec3 => mulM(a, [b[0][j] as number, b[1][j] as number, b[2][j] as number]);
	const c0 = col(0);
	const c1 = col(1);
	const c2 = col(2);
	return [
		[c0[0], c1[0], c2[0]],
		[c0[1], c1[1], c2[1]],
		[c0[2], c1[2], c2[2]],
	];
};
export function invert3(m: M3): M3 {
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

/** RGB->XYZ (Y of white = 1) from xy chromaticities of R, G, B and the white point. */
export function rgbToXyzMatrix(r: [number, number], g: [number, number], b: [number, number], w: [number, number]): M3 {
	const xyz = ([x, y]: [number, number]): Vec3 => [x / y, 1, (1 - x - y) / y];
	const R = xyz(r);
	const G = xyz(g);
	const B = xyz(b);
	const P: M3 = [
		[R[0], G[0], B[0]],
		[R[1], G[1], B[1]],
		[R[2], G[2], B[2]],
	];
	const S = mulM(invert3(P), xyz(w));
	return [
		[P[0][0] * S[0], P[0][1] * S[1], P[0][2] * S[2]],
		[P[1][0] * S[0], P[1][1] * S[1], P[1][2] * S[2]],
		[P[2][0] * S[0], P[2][1] * S[1], P[2][2] * S[2]],
	];
}

const D65_XY: [number, number] = [0.3127, 0.329];
export const SRGB_TO_XYZ = rgbToXyzMatrix([0.64, 0.33], [0.3, 0.6], [0.15, 0.06], D65_XY);
export const P3_TO_XYZ = rgbToXyzMatrix([0.68, 0.32], [0.265, 0.69], [0.15, 0.06], D65_XY);
export const P3_TO_SRGB_LINEAR = mulMM(invert3(SRGB_TO_XYZ), P3_TO_XYZ);

/** Encoded Display P3 (0-1, sRGB curve) to encoded sRGB, unclamped (may leave [0,1]). */
export function p3ToSrgb(p3: Vec3): Rgb {
	const lin = mulM(P3_TO_SRGB_LINEAR, [srgbToLinear(p3[0]), srgbToLinear(p3[1]), srgbToLinear(p3[2])]);
	return [linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])];
}

// ---------- Oklch helpers ----------

export const oklabOfHex = (hex: string): Vec3 => rgbToOklab(hexToRgb(hex));
export const oklchOfRgb = (rgb: Rgb): Oklch => oklabToOklch(rgbToOklab(rgb));
export const oklchOfHex = (hex: string): Oklch => oklchOfRgb(hexToRgb(hex));
export const oklchToRgbRaw = (c: Oklch): Rgb => oklabToRgb(oklchToOklab(c));

export function okDist(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
export const okDistHex = (a: string, b: string): number => okDist(oklabOfHex(a), oklabOfHex(b));

/** Smallest circular difference of two hue angles in degrees (0..180). */
export function hueDist(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}

/** True when a hue (degrees) lies on the arc from lo to hi going counter-clockwise (lo may exceed hi across 0). */
export function hueInBand(h: number, lo: number, hi: number): boolean {
	const n = (x: number) => ((x % 360) + 360) % 360;
	const H = n(h);
	const a = n(lo);
	const b = n(hi);
	return a <= b ? H >= a && H <= b : H >= a || H <= b;
}

const EPS = 1e-9;
export const inSrgb = (rgb: Rgb, eps = EPS): boolean => rgb.every((v) => v >= -eps && v <= 1 + eps);

/**
 * Gamut mapping by chroma reduction: keep Oklch L and h, take the largest C' <= C whose sRGB
 * coordinates lie in [0, 1] (bisection to 1e-9). L <= 0 maps to black, L >= 1 to white.
 */
export function reduceChroma(c: Oklch): { oklch: Oklch; rgb: Rgb } {
	if (c.L <= 0) return { oklch: { L: 0, C: 0, H: c.H }, rgb: [0, 0, 0] };
	if (c.L >= 1) return { oklch: { L: 1, C: 0, H: c.H }, rgb: [1, 1, 1] };
	const direct = oklchToRgbRaw(c);
	if (inSrgb(direct)) return { oklch: c, rgb: direct };
	let lo = 0;
	let hi = c.C;
	while (hi - lo > 1e-9) {
		const mid = (lo + hi) / 2;
		if (inSrgb(oklchToRgbRaw({ ...c, C: mid }))) lo = mid;
		else hi = mid;
	}
	const oklch = { ...c, C: lo };
	return { oklch, rgb: oklchToRgbRaw(oklch) };
}

/** Oklch -> 8-bit hex after chroma-reduction gamut mapping (tiny residuals clamped). */
export function hexOfOklch(L: number, C: number, H: number): string {
	return rgbToHex(reduceChroma({ L, C, H }).rgb);
}

/** Naive per-channel clip to [0,1] then 8-bit hex: the wrong-variant answer for gamut tasks. */
export const clipHex = (rgb: Rgb): string => rgbToHex(rgb);

// ---------- WCAG, CIEDE2000, deuteranopia ----------

export const contrast = (a: string, b: string): number => contrastRatio(a, b);

/** CIEDE2000 (kL = kC = kH = 1) on CIELAB from sRGB via XYZ, D65 white, no adaptation. */
export const de2000Hex = (a: string, b: string): number => deltaE2000(rgbToLab(hexToRgb(a)), rgbToLab(hexToRgb(b)));

/** Machado 2009 severity-1.0 deuteranopia in linear sRGB, clamped, encoded (unrounded). */
export const deutan = (hex: string): Rgb => simulateDeuteranopia(hexToRgb(hex));

/** CIEDE2000 between the deuteranopia simulations of two colors (simulations not rounded). */
export const deutanDE = (a: string, b: string): number => deltaE2000(rgbToLab(deutan(a)), rgbToLab(deutan(b)));

/** Same, but with each simulated color rounded to 8-bit first (a legitimate implementation variant). */
export const deutanDERounded = (a: string, b: string): number =>
	deltaE2000(rgbToLab(hexToRgb(rgbToHex(deutan(a)))), rgbToLab(hexToRgb(rgbToHex(deutan(b)))));
