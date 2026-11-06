/**
 * Hand-written color references for grading. These deliberately do not import
 * from `src/` or from colorjs.io, so a library bug cannot hide on both sides.
 * Formulas: IEC 61966-2-1 (sRGB), Ottosson (Oklab), WCAG 2 (contrast),
 * Sharma et al. 2005 (CIEDE2000), Machado et al. 2009 (deuteranopia).
 */

export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];
export interface Oklch {
	L: number;
	C: number;
	H: number;
}

// ---------- hex ----------

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(input: string): boolean {
	return HEX_RE.test(input.trim());
}

/** Parses #rgb / #rrggbb into sRGB floats in [0,1]. Throws on anything else. */
export function hexToRgb(input: string): Rgb {
	const m = HEX_RE.exec(input.trim());
	if (!m) throw new Error(`not a hex color: ${input}`);
	let h = m[1] as string;
	if (h.length === 3) {
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	}
	return [
		Number.parseInt(h.slice(0, 2), 16) / 255,
		Number.parseInt(h.slice(2, 4), 16) / 255,
		Number.parseInt(h.slice(4, 6), 16) / 255,
	];
}

export function rgbToHex(rgb: Rgb): string {
	const part = (v: number) =>
		Math.round(Math.min(1, Math.max(0, v)) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

// ---------- sRGB transfer ----------

export function srgbToLinear(v: number): number {
	const s = Math.sign(v);
	const a = Math.abs(v);
	return a <= 0.04045 ? v / 12.92 : s * ((a + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(v: number): number {
	const s = Math.sign(v);
	const a = Math.abs(v);
	return a <= 0.0031308 ? v * 12.92 : s * (1.055 * a ** (1 / 2.4) - 0.055);
}

const map3 = (v: Vec3, f: (x: number) => number): Vec3 => [
	f(v[0]),
	f(v[1]),
	f(v[2]),
];
const mul = (m: readonly Vec3[], v: Vec3): Vec3 => [
	(m[0] as Vec3)[0] * v[0] +
		(m[0] as Vec3)[1] * v[1] +
		(m[0] as Vec3)[2] * v[2],
	(m[1] as Vec3)[0] * v[0] +
		(m[1] as Vec3)[1] * v[1] +
		(m[1] as Vec3)[2] * v[2],
	(m[2] as Vec3)[0] * v[0] +
		(m[2] as Vec3)[1] * v[1] +
		(m[2] as Vec3)[2] * v[2],
];

// ---------- Oklab (Ottosson, linear sRGB <-> LMS <-> Lab) ----------

const M1: readonly Vec3[] = [
	[0.4122214708, 0.5363325363, 0.0514459929],
	[0.2119034982, 0.6806995451, 0.1073969566],
	[0.0883024619, 0.2817188376, 0.6299787005],
];
const M2: readonly Vec3[] = [
	[0.2104542553, 0.793617785, -0.0040720468],
	[1.9779984951, -2.428592205, 0.4505937099],
	[0.0259040371, 0.7827717662, -0.808675766],
];
const M2_INV: readonly Vec3[] = [
	[1, 0.3963377774, 0.2158037573],
	[1, -0.1055613458, -0.0638541728],
	[1, -0.0894841775, -1.291485548],
];
const M1_INV: readonly Vec3[] = [
	[4.0767416621, -3.3077115913, 0.2309699292],
	[-1.2684380046, 2.6097574011, -0.3413193965],
	[-0.0041960863, -0.7034186147, 1.707614701],
];

export function rgbToOklab(rgb: Rgb): Vec3 {
	const lin = map3(rgb, srgbToLinear);
	const lms = mul(M1, lin);
	return mul(M2, map3(lms, Math.cbrt));
}

export function oklabToRgb(lab: Vec3): Rgb {
	const lms_ = mul(M2_INV, lab);
	const lms = map3(lms_, (x) => x * x * x);
	return map3(mul(M1_INV, lms), linearToSrgb);
}

export function oklabToOklch(lab: Vec3): Oklch {
	const C = Math.hypot(lab[1], lab[2]);
	let H = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
	if (H < 0) H += 360;
	return { L: lab[0], C, H };
}

export function oklchToOklab(c: Oklch): Vec3 {
	const h = (c.H * Math.PI) / 180;
	return [c.L, c.C * Math.cos(h), c.C * Math.sin(h)];
}

export const rgbToOklch = (rgb: Rgb): Oklch => oklabToOklch(rgbToOklab(rgb));
export const oklchToRgb = (c: Oklch): Rgb => oklabToRgb(oklchToOklab(c));

export function okDistance(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function hexOkDistance(a: string, b: string): number {
	return okDistance(rgbToOklab(hexToRgb(a)), rgbToOklab(hexToRgb(b)));
}

/** Smallest absolute circular difference of two hue angles, in degrees (0..180). */
export function hueDiff(a: number, b: number): number {
	const d = Math.abs(((((a - b) % 360) + 540) % 360) - 180);
	return d;
}

// ---------- gamut ----------

export const GAMUT_TOL = 0.0005;

export function inGamut(rgb: Rgb, tol = GAMUT_TOL): boolean {
	return rgb.every((v) => v >= -tol && v <= 1 + tol);
}

/**
 * Preserves L and H, returns the largest in-gamut chroma C' <= c.C
 * (bisection to 1e-7). Lightness outside (0,1) maps to black/white.
 */
export function gamutMapOklch(c: Oklch): { oklch: Oklch; rgb: Rgb } {
	if (c.L <= 0) return { oklch: { L: 0, C: 0, H: c.H }, rgb: [0, 0, 0] };
	if (c.L >= 1) return { oklch: { L: 1, C: 0, H: c.H }, rgb: [1, 1, 1] };
	const direct = oklchToRgb(c);
	if (inGamut(direct)) return { oklch: c, rgb: direct };
	let lo = 0;
	let hi = c.C;
	while (hi - lo > 1e-7) {
		const mid = (lo + hi) / 2;
		if (inGamut(oklchToRgb({ ...c, C: mid }))) lo = mid;
		else hi = mid;
	}
	const oklch = { ...c, C: lo };
	return { oklch, rgb: oklchToRgb(oklch) };
}

// ---------- WCAG ----------

export function relativeLuminance(rgb: Rgb): number {
	const [r, g, b] = map3(rgb, srgbToLinear);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatioRgb(a: Rgb, b: Rgb): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const hi = Math.max(la, lb);
	const lo = Math.min(la, lb);
	return (hi + 0.05) / (lo + 0.05);
}

/** Contrast of two hex colors, from the exact (rounded) hex values. */
export function contrastRatio(hexA: string, hexB: string): number {
	return contrastRatioRgb(hexToRgb(hexA), hexToRgb(hexB));
}

/** Source-over compositing of an sRGB color with alpha onto an opaque sRGB background. */
export function compositeOver(fg: Rgb, alpha: number, bg: Rgb): Rgb {
	return [
		fg[0] * alpha + bg[0] * (1 - alpha),
		fg[1] * alpha + bg[1] * (1 - alpha),
		fg[2] * alpha + bg[2] * (1 - alpha),
	];
}

// ---------- CIEDE2000 ----------

const RGB_TO_XYZ: readonly Vec3[] = [
	[0.4124564, 0.3575761, 0.1804375],
	[0.2126729, 0.7151522, 0.072175],
	[0.0193339, 0.119192, 0.9503041],
];
const D65: Vec3 = [0.95047, 1, 1.08883];

export function rgbToLab(rgb: Rgb): Vec3 {
	const xyz = mul(RGB_TO_XYZ, map3(rgb, srgbToLinear));
	const f = (t: number) =>
		t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
	const fx = f(xyz[0] / D65[0]);
	const fy = f(xyz[1] / D65[1]);
	const fz = f(xyz[2] / D65[2]);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function deltaE2000(lab1: Vec3, lab2: Vec3): number {
	const [L1, a1, b1] = lab1;
	const [L2, a2, b2] = lab2;
	const C1 = Math.hypot(a1, b1);
	const C2 = Math.hypot(a2, b2);
	const Cbar = (C1 + C2) / 2;
	const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
	const a1p = (1 + G) * a1;
	const a2p = (1 + G) * a2;
	const C1p = Math.hypot(a1p, b1);
	const C2p = Math.hypot(a2p, b2);
	const hp = (b: number, ap: number) => {
		if (b === 0 && ap === 0) return 0;
		const h = deg(Math.atan2(b, ap));
		return h < 0 ? h + 360 : h;
	};
	const h1p = hp(b1, a1p);
	const h2p = hp(b2, a2p);
	const dLp = L2 - L1;
	const dCp = C2p - C1p;
	let dhp = 0;
	if (C1p * C2p !== 0) {
		dhp = h2p - h1p;
		if (dhp > 180) dhp -= 360;
		else if (dhp < -180) dhp += 360;
	}
	const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
	const Lbarp = (L1 + L2) / 2;
	const Cbarp = (C1p + C2p) / 2;
	let hbarp = h1p + h2p;
	if (C1p * C2p !== 0) {
		if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
		else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
		else hbarp = (h1p + h2p - 360) / 2;
	}
	const T =
		1 -
		0.17 * Math.cos(rad(hbarp - 30)) +
		0.24 * Math.cos(rad(2 * hbarp)) +
		0.32 * Math.cos(rad(3 * hbarp + 6)) -
		0.2 * Math.cos(rad(4 * hbarp - 63));
	const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
	const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
	const Sl =
		1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
	const Sc = 1 + 0.045 * Cbarp;
	const Sh = 1 + 0.015 * Cbarp * T;
	const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
	return Math.sqrt(
		(dLp / Sl) ** 2 +
			(dCp / Sc) ** 2 +
			(dHp / Sh) ** 2 +
			Rt * (dCp / Sc) * (dHp / Sh),
	);
}

export function hexDeltaE2000(a: string, b: string): number {
	return deltaE2000(rgbToLab(hexToRgb(a)), rgbToLab(hexToRgb(b)));
}

// ---------- color-vision deficiency ----------

const DEUTAN_1: readonly Vec3[] = [
	[0.367322, 0.860646, -0.227968],
	[0.280085, 0.672501, 0.047413],
	[-0.01182, 0.04294, 0.968881],
];

/** Machado 2009 deuteranopia, severity 1.0, in linear sRGB; result clipped to [0,1]. */
export function simulateDeuteranopia(rgb: Rgb): Rgb {
	const lin = map3(rgb, srgbToLinear);
	const sim = mul(DEUTAN_1, lin);
	const clipped = map3(sim, (v) => Math.min(1, Math.max(0, v)));
	return map3(clipped, linearToSrgb);
}

export function minPairwise(
	colors: readonly string[],
	dist: (a: string, b: string) => number,
): number {
	let min = Number.POSITIVE_INFINITY;
	for (let i = 0; i < colors.length; i++) {
		for (let j = i + 1; j < colors.length; j++) {
			min = Math.min(min, dist(colors[i] as string, colors[j] as string));
		}
	}
	return min;
}

export function deutanDeltaE(hexA: string, hexB: string): number {
	return deltaE2000(
		rgbToLab(simulateDeuteranopia(hexToRgb(hexA))),
		rgbToLab(simulateDeuteranopia(hexToRgb(hexB))),
	);
}

// ---------- Display P3 ----------

const XYZ_TO_P3: readonly Vec3[] = [
	[2.4934969, -0.9313836, -0.4027108],
	[-0.829489, 1.7626641, 0.0236247],
	[0.0358458, -0.0761724, 0.9568845],
];

/** sRGB (encoded) to Display P3 (encoded, same transfer curve). */
export function rgbToP3(rgb: Rgb): Rgb {
	const xyz = mul(RGB_TO_XYZ, map3(rgb, srgbToLinear));
	return map3(mul(XYZ_TO_P3, xyz), linearToSrgb);
}
