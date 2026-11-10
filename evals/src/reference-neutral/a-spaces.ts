/**
 * Author A reference: color-space conversions, written by hand from the published definitions.
 *
 * - sRGB transfer: IEC 61966-2-1 (piecewise, 0.04045 / 12.92 / 2.4).
 * - RGB <-> XYZ matrices are derived here from the primaries' xy chromaticities and the D65 white
 *   (x 0.3127, y 0.3290), the standard "normalized primary matrix" construction (SMPTE RP 177):
 *   sRGB/BT.709 (0.64,0.33)(0.30,0.60)(0.15,0.06); Display P3 (0.680,0.320)(0.265,0.690)(0.150,0.060);
 *   BT.2020 (0.708,0.292)(0.170,0.797)(0.131,0.046).
 * - CIELAB / LCh(ab): CIE 15 (epsilon 216/24389, kappa 24389/27), D65 white, no chromatic adaptation.
 * - Display P3 uses the sRGB transfer curve (CSS Color 4). Rec.2020 encoding uses the BT.2020 OETF
 *   (alpha 1.09929682680944, beta 0.018053968510807).
 * - HSL / HSV / HWB: CSS Color 4 definitions (equivalent to Smith 1978 hexcone for HSV).
 * - Naive CMYK: K = 1 - max(R,G,B), C = (1-R-K)/(1-K) etc., C=M=Y=0 for black.
 * - Oklab / Oklch: Ottosson 2020, via src/reference/color.ts.
 */
import {
	linearToSrgb,
	oklabToRgb,
	type Rgb,
	rgbToOklab,
	srgbToLinear,
	type Vec3,
} from "../reference/color.js";

export type Mat3 = readonly [Vec3, Vec3, Vec3];

export const mulM = (m: Mat3, v: Vec3): Vec3 => [
	m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
	m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
	m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

export function invert3(m: Mat3): Mat3 {
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

const xyToXyz = (x: number, y: number): Vec3 => [x / y, 1, (1 - x - y) / y];

/** D65 white from its CIE 1931 chromaticity (0.3127, 0.3290), Y = 1. */
export const D65_XY: Vec3 = xyToXyz(0.3127, 0.329);

/** Normalized primary matrix: linear RGB (white = 1,1,1) -> XYZ with Y of white = 1. */
export function primaryMatrix(
	r: [number, number],
	g: [number, number],
	b: [number, number],
	white: Vec3 = D65_XY,
): Mat3 {
	const R = xyToXyz(...r);
	const G = xyToXyz(...g);
	const B = xyToXyz(...b);
	const P: Mat3 = [
		[R[0], G[0], B[0]],
		[R[1], G[1], B[1]],
		[R[2], G[2], B[2]],
	];
	const S = mulM(invert3(P), white);
	return [
		[P[0][0] * S[0], P[0][1] * S[1], P[0][2] * S[2]],
		[P[1][0] * S[0], P[1][1] * S[1], P[1][2] * S[2]],
		[P[2][0] * S[0], P[2][1] * S[1], P[2][2] * S[2]],
	];
}

export const SRGB_TO_XYZ = primaryMatrix([0.64, 0.33], [0.3, 0.6], [0.15, 0.06]);
export const XYZ_TO_SRGB = invert3(SRGB_TO_XYZ);
export const P3_TO_XYZ = primaryMatrix([0.68, 0.32], [0.265, 0.69], [0.15, 0.06]);
export const XYZ_TO_P3 = invert3(P3_TO_XYZ);
export const REC2020_TO_XYZ = primaryMatrix([0.708, 0.292], [0.17, 0.797], [0.131, 0.046]);
export const XYZ_TO_REC2020 = invert3(REC2020_TO_XYZ);

const map3 = (v: Vec3, f: (x: number) => number): Vec3 => [f(v[0]), f(v[1]), f(v[2])];

// ---------- linear sRGB / XYZ ----------

export const srgbToLinearRgb = (rgb: Rgb): Vec3 => map3(rgb, srgbToLinear);
export const linearRgbToSrgb = (lin: Vec3): Rgb => map3(lin, linearToSrgb);
export const srgbToXyz = (rgb: Rgb): Vec3 => mulM(SRGB_TO_XYZ, srgbToLinearRgb(rgb));
export const xyzToSrgb = (xyz: Vec3): Rgb => linearRgbToSrgb(mulM(XYZ_TO_SRGB, xyz));

// ---------- CIELAB / LCh(ab), D65 ----------

const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

export function xyzToLab(xyz: Vec3, white: Vec3 = D65_XY): Vec3 {
	const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
	const fx = f(xyz[0] / white[0]);
	const fy = f(xyz[1] / white[1]);
	const fz = f(xyz[2] / white[2]);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToXyz(lab: Vec3, white: Vec3 = D65_XY): Vec3 {
	const fy = (lab[0] + 16) / 116;
	const fx = fy + lab[1] / 500;
	const fz = fy - lab[2] / 200;
	const inv = (f: number) => (f ** 3 > EPS ? f ** 3 : (116 * f - 16) / KAPPA);
	const yr = lab[0] > KAPPA * EPS ? fy ** 3 : lab[0] / KAPPA;
	return [inv(fx) * white[0], yr * white[1], inv(fz) * white[2]];
}

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const hue360 = (h: number) => ((h % 360) + 360) % 360;

/** Rectangular (L, a, b) -> polar (L, C, h in degrees [0,360)). Works for CIELAB and Oklab. */
export const toPolar = (lab: Vec3): Vec3 => [
	lab[0],
	Math.hypot(lab[1], lab[2]),
	hue360(deg(Math.atan2(lab[2], lab[1]))),
];
export const fromPolar = (lch: Vec3): Vec3 => [
	lch[0],
	lch[1] * Math.cos(rad(lch[2])),
	lch[1] * Math.sin(rad(lch[2])),
];

export const srgbToLab = (rgb: Rgb): Vec3 => xyzToLab(srgbToXyz(rgb));
export const srgbToLch = (rgb: Rgb): Vec3 => toPolar(srgbToLab(rgb));
export const labToSrgb = (lab: Vec3): Rgb => xyzToSrgb(labToXyz(lab));
export const lchToSrgb = (lch: Vec3): Rgb => labToSrgb(fromPolar(lch));

// ---------- Oklab / Oklch (Ottosson) ----------

export const srgbToOklabV = (rgb: Rgb): Vec3 => rgbToOklab(rgb);
export const srgbToOklchV = (rgb: Rgb): Vec3 => toPolar(rgbToOklab(rgb));
export const oklchToSrgb = (lch: Vec3): Rgb => oklabToRgb(fromPolar(lch));

// ---------- HSL / HSV / HWB (hue degrees, other components 0..1) ----------

function hueOf(r: number, g: number, b: number): number {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	if (d === 0) return 0;
	let h: number;
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return hue360(h * 60);
}

export function srgbToHsl(rgb: Rgb): Vec3 {
	const [r, g, b] = rgb;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	return [hueOf(r, g, b), s, l];
}

export function srgbToHsv(rgb: Rgb): Vec3 {
	const [r, g, b] = rgb;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	return [hueOf(r, g, b), max === 0 ? 0 : (max - min) / max, max];
}

export function srgbToHwb(rgb: Rgb): Vec3 {
	const [r, g, b] = rgb;
	return [hueOf(r, g, b), Math.min(r, g, b), 1 - Math.max(r, g, b)];
}

export function hsvToSrgb(hsv: Vec3): Rgb {
	const [h, s, v] = hsv;
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
	};
	return [f(5), f(3), f(1)];
}

export function hslToSrgb(hsl: Vec3): Rgb {
	const [h, s, l] = hsl;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return [f(0), f(8), f(4)];
}

// ---------- naive CMYK (fractions 0..1) ----------

export function srgbToCmykNaive(rgb: Rgb): [number, number, number, number] {
	const k = 1 - Math.max(...rgb);
	if (k >= 1) return [0, 0, 0, 1];
	const [r, g, b] = rgb;
	return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}

// ---------- Display P3 and Rec.2020 ----------

export const srgbToP3 = (rgb: Rgb): Rgb =>
	map3(mulM(XYZ_TO_P3, srgbToXyz(rgb)), linearToSrgb);
export const p3ToSrgb = (p3: Rgb): Rgb => xyzToSrgb(mulM(P3_TO_XYZ, map3(p3, srgbToLinear)));

const BT2020_ALPHA = 1.09929682680944;
const BT2020_BETA = 0.018053968510807;

/** BT.2020 OETF (camera transfer), linear [0,1] -> encoded. */
export const bt2020Oetf = (l: number): number =>
	l < BT2020_BETA ? 4.5 * l : BT2020_ALPHA * l ** 0.45 - (BT2020_ALPHA - 1);

export const srgbToRec2020Linear = (rgb: Rgb): Vec3 => mulM(XYZ_TO_REC2020, srgbToXyz(rgb));
export const srgbToRec2020 = (rgb: Rgb): Vec3 => map3(srgbToRec2020Linear(rgb), bt2020Oetf);

/** Rounds each channel to the nearest 8-bit value after clamping (as in rgbToHex). */
export const to8 = (rgb: Rgb): [number, number, number] =>
	rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as [number, number, number];
