import Color from "colorjs.io";
import keywords from "colorjs.io/src/keywords.js";

// Public functions take Rgb or Oklch so the rest of the engine never touches Color.js objects.
export type Rgb = [number, number, number];
export interface Oklch {
	l: number;
	c: number;
	h: number;
}
export interface Parsed {
	input: string;
	/** Not clamped: wide-gamut inputs may fall outside 0..1. */
	rgb: Rgb;
	alpha: number;
	space: string;
}

// The message tells the caller (often a small model) how to fix the input.
export class ColorError extends Error {}

export const NAMED_COLORS: string[] = Object.keys(keywords);

const BARE_HEX = /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function editDistance(a: string, b: string): number {
	const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let prev = dp[0] as number;
		dp[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = dp[j] as number;
			dp[j] = Math.min(
				(dp[j] as number) + 1,
				(dp[j - 1] as number) + 1,
				prev + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
			prev = tmp;
		}
	}
	return dp[b.length] as number;
}

function closestName(word: string): string | undefined {
	const w = word.toLowerCase();
	let best: string | undefined;
	let bestD = Number.POSITIVE_INFINITY;
	for (const n of NAMED_COLORS) {
		const d = editDistance(w, n);
		if (d < bestD) {
			bestD = d;
			best = n;
		}
	}
	return best && bestD <= Math.max(2, Math.floor(w.length / 3))
		? best
		: undefined;
}

export const ACCEPTED_FORMATS =
	'hex (#rgb, #rrggbb, #rrggbbaa), rgb(255 0 0), hsl(210 50% 40%), oklch(0.6 0.2 250), oklab(), lab(), lch(), hwb(), color(display-p3 1 0 0), or a CSS name like "tomato"';

export function parseColor(raw: string): Parsed {
	if (typeof raw !== "string" || raw.trim() === "") {
		throw new ColorError(`Empty color. Provide one of: ${ACCEPTED_FORMATS}.`);
	}
	let text = raw.trim().replace(/^["']|["']$/g, "");
	if (BARE_HEX.test(text)) text = `#${text}`;
	let color: Color;
	try {
		color = new Color(text);
	} catch {
		const hint = /^[a-z]+$/i.test(text) ? closestName(text) : undefined;
		throw new ColorError(
			`Could not read "${raw}" as a color.${hint ? ` Did you mean "${hint}"?` : ""} Accepted: ${ACCEPTED_FORMATS}.`,
		);
	}
	const srgb = color.to("srgb");
	const coords = srgb.coords.map((v) => (Number.isNaN(v) ? 0 : v)) as Rgb;
	const alpha = Number.isNaN(color.alpha) ? 1 : (color.alpha as number);
	return { input: text, rgb: coords, alpha, space: color.space.id };
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function rgbToHex(rgb: Rgb, alpha = 1): string {
	const part = (v: number) =>
		Math.round(clamp01(v) * 255)
			.toString(16)
			.padStart(2, "0");
	const base = `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
	return alpha < 1 ? `${base}${part(alpha)}` : base;
}

export function hexToRgb(hex: string): Rgb {
	const p = parseColor(hex);
	return [clamp01(p.rgb[0]), clamp01(p.rgb[1]), clamp01(p.rgb[2])];
}

// Oklab (Ottosson): linear sRGB <-> LMS <-> Lab. Hand-rolled: it runs in tight search loops
// and must not depend on a library's color-object overhead.
const srgbToLinear = (v: number): number => {
	const a = Math.abs(v);
	return a <= 0.04045 ? v / 12.92 : Math.sign(v) * ((a + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (v: number): number => {
	const a = Math.abs(v);
	return a <= 0.0031308
		? v * 12.92
		: Math.sign(v) * (1.055 * a ** (1 / 2.4) - 0.055);
};

export function rgbToOklab(rgb: Rgb): [number, number, number] {
	const r = srgbToLinear(rgb[0]);
	const g = srgbToLinear(rgb[1]);
	const b = srgbToLinear(rgb[2]);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

export function oklabToRgb(lab: [number, number, number]): Rgb {
	const l = (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3;
	const m = (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3;
	const s = (lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2]) ** 3;
	return [
		linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	];
}

export function rgbToOklch(rgb: Rgb): Oklch {
	const [l, a, b] = rgbToOklab(rgb);
	const c = Math.hypot(a, b);
	return {
		l,
		c,
		h: c < 1e-6 ? 0 : normHue((Math.atan2(b, a) * 180) / Math.PI),
	};
}

export function oklchToRgb(c: Oklch): Rgb {
	const h = (c.h * Math.PI) / 180;
	return oklabToRgb([c.l, c.c * Math.cos(h), c.c * Math.sin(h)]);
}

export const okDistance = (
	a: [number, number, number],
	b: [number, number, number],
): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const GAMUT_EPS = 0.0005;

export function inGamut(rgb: Rgb, eps = GAMUT_EPS): boolean {
	return rgb.every((v) => v >= -eps && v <= 1 + eps);
}

export interface GamutResult {
	oklch: Oklch;
	rgb: Rgb;
	mapped: boolean;
}

// Reduces chroma only, so lightness and hue are kept.
export function gamutMap(c: Oklch): GamutResult {
	if (c.l <= 0)
		return { oklch: { l: 0, c: 0, h: c.h }, rgb: [0, 0, 0], mapped: c.c > 0 };
	if (c.l >= 1)
		return { oklch: { l: 1, c: 0, h: c.h }, rgb: [1, 1, 1], mapped: c.c > 0 };
	const direct = oklchToRgb(c);
	if (inGamut(direct))
		return { oklch: c, rgb: direct.map(clamp01) as Rgb, mapped: false };
	let lo = 0;
	let hi = c.c;
	while (hi - lo > 1e-7) {
		const mid = (lo + hi) / 2;
		if (inGamut(oklchToRgb({ ...c, c: mid }))) lo = mid;
		else hi = mid;
	}
	const oklch = { ...c, c: lo };
	return { oklch, rgb: oklchToRgb(oklch).map(clamp01) as Rgb, mapped: true };
}

export const hueDiff = (a: number, b: number): number =>
	Math.abs(((((a - b) % 360) + 540) % 360) - 180);

export const normHue = (h: number): number => ((h % 360) + 360) % 360;

export function compositeOver(fg: Rgb, alpha: number, bg: Rgb): Rgb {
	return [
		fg[0] * alpha + bg[0] * (1 - alpha),
		fg[1] * alpha + bg[1] * (1 - alpha),
		fg[2] * alpha + bg[2] * (1 - alpha),
	];
}

export function round(v: number, digits: number): number {
	const f = 10 ** digits;
	return Math.round(v * f) / f;
}
