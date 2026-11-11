/**
 * Author A, neutral suite v2: inverse conversions the v1 reference (a-spaces.ts) does not have.
 * Hand-written from the published definitions; everything else is imported from a-spaces.ts.
 *
 * - HWB -> sRGB: CSS Color 4, section "Converting HWB colors to sRGB colors": when w + b >= 1 the
 *   result is the gray w / (w + b); otherwise rgb = hsl(h, 100%, 50%) * (1 - w - b) + w.
 * - BT.2020 inverse OETF: L = V / 4.5 for V < 4.5·beta, otherwise ((V + alpha - 1) / alpha)^(1/0.45)
 *   (ITU-R BT.2020-2 Table 4, alpha 1.09929682680944, beta 0.018053968510807).
 * - Naive CMYK -> sRGB: R = (1 - C)(1 - K), G = (1 - M)(1 - K), B = (1 - Y)(1 - K), the exact
 *   inverse of the naive forward formula in a-spaces.ts.
 * - Oklab -> sRGB and XYZ -> sRGB come from a-spaces.ts / color.ts.
 */
import { compositeOver, hexToRgb, type Rgb, rgbToHex, type Vec3 } from "../reference/color.js";
import { hslToSrgb, mulM, REC2020_TO_XYZ, xyzToSrgb } from "./a-spaces.js";

export function hwbToSrgb(hwb: Vec3): Rgb {
	const [h, w, b] = hwb;
	if (w + b >= 1) {
		const g = w / (w + b);
		return [g, g, g];
	}
	const base = hslToSrgb([h, 1, 0.5]);
	return base.map((c) => c * (1 - w - b) + w) as unknown as Rgb;
}

const BT2020_ALPHA = 1.09929682680944;
const BT2020_BETA = 0.018053968510807;

/** Inverse of the BT.2020 OETF: encoded V in [0,1] -> linear L. */
export const bt2020InverseOetf = (v: number): number =>
	v < 4.5 * BT2020_BETA ? v / 4.5 : ((v + BT2020_ALPHA - 1) / BT2020_ALPHA) ** (1 / 0.45);

export const rec2020LinearToSrgb = (lin: Vec3): Rgb => xyzToSrgb(mulM(REC2020_TO_XYZ, lin));
export const rec2020ToSrgb = (enc: Vec3): Rgb =>
	rec2020LinearToSrgb([bt2020InverseOetf(enc[0]), bt2020InverseOetf(enc[1]), bt2020InverseOetf(enc[2])]);

export function cmykNaiveToSrgb(cmyk: readonly [number, number, number, number]): Rgb {
	const [c, m, y, k] = cmyk;
	return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
}

/**
 * Source-over composite of a text color at opacity `alpha` onto an opaque background, blended on the
 * gamma-encoded sRGB channels (how browsers composite by default, CSS Compositing Level 1), and
 * rounded to the nearest 8-bit value (what ends up in the frame buffer). Returns the hex.
 */
export const compositeHex = (textHex: string, alpha: number, bgHex: string): string =>
	rgbToHex(compositeOver(hexToRgb(textHex), alpha, hexToRgb(bgHex)));

/** Unrounded composite (channels 0..1), for measuring how much the 8-bit rounding matters. */
export const compositeRgb = (textHex: string, alpha: number, bgHex: string): Rgb =>
	compositeOver(hexToRgb(textHex), alpha, hexToRgb(bgHex));
