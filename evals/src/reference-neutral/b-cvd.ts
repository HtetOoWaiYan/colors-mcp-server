/**
 * Color-vision-deficiency simulation, Machado, Oliveira & Fernandes (2009), "A Physiologically-based
 * Model for Simulation of Color Vision Deficiency", IEEE TVCG 15(6). Severity 1.0 matrices from the
 * paper's supplementary table, applied to linear sRGB: decode with the IEC 61966-2-1 curve,
 * multiply, clamp each channel to [0, 1], re-encode.
 */
import { deltaE2000, hexToRgb, rgbToLab } from "../reference/color.js";
import { clampRgb, fromLinear, hexOf, type M3, mulM, type Rgb, toLinear } from "./b-spaces.js";

export type Cvd = "protanopia" | "deuteranopia" | "tritanopia";
export const CVDS: readonly Cvd[] = ["protanopia", "deuteranopia", "tritanopia"];

export const MACHADO_1: Record<Cvd, M3> = {
	protanopia: [
		[0.152286, 1.052583, -0.204868],
		[0.114503, 0.786281, 0.099216],
		[-0.003882, -0.048116, 1.051998],
	],
	deuteranopia: [
		[0.367322, 0.860646, -0.227968],
		[0.280085, 0.672501, 0.047413],
		[-0.01182, 0.04294, 0.968881],
	],
	tritanopia: [
		[1.255528, -0.076749, -0.178779],
		[-0.078411, 0.930809, 0.147602],
		[0.004733, 0.691367, 0.3039],
	],
};

/** Simulated sRGB (encoded, in [0,1], unrounded). */
export function simulate(rgb: Rgb, kind: Cvd): Rgb {
	const lin = clampRgb(mulM(MACHADO_1[kind], toLinear(rgb)));
	return fromLinear(lin);
}

export const simulateHex = (hex: string, kind: Cvd): string => hexOf(simulate(hexToRgb(hex), kind));

/** The common mistake: the matrix applied to gamma-encoded sRGB. */
export function simulateEncodedWrong(hex: string, kind: Cvd): string {
	return hexOf(mulM(MACHADO_1[kind], hexToRgb(hex)));
}

/**
 * CIEDE2000 (CIELAB D65, no adaptation) between two colors after simulation. `rounded` quantizes the
 * simulated colors to 8-bit first (what a person working with hex values would do).
 */
export function cvdDeltaE(a: string, b: string, kind: Cvd, rounded = false): number {
	const sa = simulate(hexToRgb(a), kind);
	const sb = simulate(hexToRgb(b), kind);
	const q = (rgb: Rgb): Rgb => (rounded ? hexToRgb(hexOf(rgb)) : rgb);
	return deltaE2000(rgbToLab(q(sa)), rgbToLab(q(sb)));
}

/** Both conventions (unrounded and 8-bit rounded), so a margin can be checked against either. */
export const cvdDeltaEBoth = (a: string, b: string, kind: Cvd): [number, number] => [
	cvdDeltaE(a, b, kind, false),
	cvdDeltaE(a, b, kind, true),
];
