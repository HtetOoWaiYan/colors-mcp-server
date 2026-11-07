import {
	hexToRgb,
	hueDiff,
	okDistance,
	type Rgb,
	relativeLuminance,
	rgbToHex,
	rgbToOklab,
	rgbToOklch,
	srgbToLinear,
} from "./color.js";

export const HUE_MAX_DRIFT = 15;
export const HUE_MIN_CHROMA = 0.04;

/** True when hue drift is not constrained (original chroma < 0.04) or within 15 degrees. */
export function hueConstraintApplies(origHex: string): boolean {
	return rgbToOklch(hexToRgb(origHex)).C >= HUE_MIN_CHROMA;
}

export function hueOk(origHex: string, candidate: Rgb): boolean {
	const o = rgbToOklch(hexToRgb(origHex));
	if (o.C < HUE_MIN_CHROMA) return true;
	return hueDiff(o.H, rgbToOklch(candidate).H) <= HUE_MAX_DRIFT;
}

/**
 * Exhaustive search over all opaque 8-bit sRGB colors: the minimum Oklab distance from `fg` to a color
 * that meets the contrast target against `bg` and the hue constraint. Exact, because answers are 8-bit hex.
 */
export function enumerateBest(
	fg: string,
	bg: string,
	target: number,
): { dStar: number; witness: string } {
	const lin = Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));
	const lBg = relativeLuminance(hexToRgb(bg));
	const origLab = rgbToOklab(hexToRgb(fg));
	const o = rgbToOklch(hexToRgb(fg));
	const constrained = o.C >= HUE_MIN_CHROMA;
	let best = Number.POSITIVE_INFINITY;
	let bestHex = "";
	for (let r = 0; r < 256; r++) {
		for (let g = 0; g < 256; g++) {
			for (let b = 0; b < 256; b++) {
				const l =
					0.2126 * (lin[r] as number) +
					0.7152 * (lin[g] as number) +
					0.0722 * (lin[b] as number);
				const hi = Math.max(l, lBg);
				const lo = Math.min(l, lBg);
				if ((hi + 0.05) / (lo + 0.05) < target) continue;
				const rgb: Rgb = [r / 255, g / 255, b / 255];
				const lab = rgbToOklab(rgb);
				const d = okDistance(origLab, lab);
				if (d >= best) continue;
				if (constrained && hueDiff(o.H, rgbToOklch(rgb).H) > HUE_MAX_DRIFT)
					continue;
				best = d;
				bestHex = rgbToHex(rgb);
			}
		}
	}
	return { dStar: best, witness: bestHex };
}
