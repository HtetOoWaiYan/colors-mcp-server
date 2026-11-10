/**
 * Author A reference: color differences on CIELAB (D65 white, no chromatic adaptation).
 *
 * - CIE76: Euclidean distance in L*a*b*.
 * - CIE94, graphic-arts weights: kL = kC = kH = 1, K1 = 0.045, K2 = 0.015, SL = 1,
 *   SC = 1 + K1*C1, SH = 1 + K2*C1, where C1 is the chroma of the FIRST (reference) color
 *   (CIE 116-1995). Not symmetric.
 * - CIEDE2000 with kL = kC = kH = 1 (Sharma, Wu, Dalal 2005), via src/reference/color.ts.
 */
import { deltaE2000, hexToRgb, type Vec3 } from "../reference/color.js";
import { srgbToLab } from "./a-spaces.js";

export const labOfHex = (hex: string): Vec3 => srgbToLab(hexToRgb(hex));

export const deltaE76 = (a: Vec3, b: Vec3): number =>
	Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function deltaE94GraphicArts(ref: Vec3, sample: Vec3): number {
	const dL = ref[0] - sample[0];
	const C1 = Math.hypot(ref[1], ref[2]);
	const C2 = Math.hypot(sample[1], sample[2]);
	const dC = C1 - C2;
	const da = ref[1] - sample[1];
	const db = ref[2] - sample[2];
	const dH2 = Math.max(0, da * da + db * db - dC * dC);
	const SC = 1 + 0.045 * C1;
	const SH = 1 + 0.015 * C1;
	return Math.sqrt(dL * dL + (dC / SC) ** 2 + dH2 / SH ** 2);
}

export const de76Hex = (a: string, b: string) => deltaE76(labOfHex(a), labOfHex(b));
export const de94Hex = (ref: string, sample: string) =>
	deltaE94GraphicArts(labOfHex(ref), labOfHex(sample));
export const de00Hex = (a: string, b: string) => deltaE2000(labOfHex(a), labOfHex(b));
