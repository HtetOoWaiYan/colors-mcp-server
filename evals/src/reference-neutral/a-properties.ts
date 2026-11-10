/**
 * Author A reference: derived color properties.
 *
 * - WCAG 2.x relative luminance (sRGB piecewise linearization, 0.2126/0.7152/0.0722).
 * - Oklab L / Oklch chroma (Ottosson 2020).
 * - HSL saturation (CSS Color 4).
 * - BT.709 luma on gamma-encoded values: Y' = 0.2126 R' + 0.7152 G' + 0.0722 B' (ITU-R BT.709-6 item 3.2),
 *   gray = round(255 * Y').
 * - Oklab-L gray: the neutral (R=G=B) sRGB color with the same Oklab L. For a neutral, Oklab L = cbrt(Ylin)
 *   because the M1 rows and the first M2 row each sum to 1 (up to the published 10-digit rounding), so
 *   the gray's linear value is L^3; we solve numerically against the forward transform anyway.
 */
import {
	hexToRgb,
	linearToSrgb,
	relativeLuminance,
	rgbToOklab,
	rgbToHex,
} from "../reference/color.js";
import { srgbToHsl, srgbToOklchV } from "./a-spaces.js";

export const wcagLuminance = (hex: string) => relativeLuminance(hexToRgb(hex));
export const oklabL = (hex: string) => rgbToOklab(hexToRgb(hex))[0];
export const oklchC = (hex: string) => srgbToOklchV(hexToRgb(hex))[1];
export const hslS = (hex: string) => srgbToHsl(hexToRgb(hex))[1];

export function bt709Luma(hex: string): number {
	const [r, g, b] = hexToRgb(hex);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const bt709Gray = (hex: string): string => {
	const y = bt709Luma(hex);
	return rgbToHex([y, y, y]);
};

/** Encoded gray value v in [0,1] whose Oklab L equals the target, by bisection on the forward transform. */
export function grayForOklabL(L: number): number {
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		if (rgbToOklab([mid, mid, mid])[0] < L) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

export const oklabGray = (hex: string): string => {
	const v = grayForOklabL(oklabL(hex));
	return rgbToHex([v, v, v]);
};

/** Closed form for comparison: encode(L^3). */
export const oklabGrayClosedForm = (hex: string): string => {
	const v = linearToSrgb(oklabL(hex) ** 3);
	return rgbToHex([v, v, v]);
};
