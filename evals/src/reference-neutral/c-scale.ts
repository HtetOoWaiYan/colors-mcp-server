/**
 * Witness builders for the generation categories (309 tonal-scale, 310 role-tokens, 312 dark-theme
 * repair). They pick Oklch lightness/chroma targets at a fixed hue and gamut-map by chroma reduction
 * (c-color.ts). The graders never compare against these colors; they only need to pass every check,
 * which the task builder asserts.
 */
import { hexOfOklch, oklchOfHex } from "./c-color.js";

export const SCALE_KEYS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

/** Piecewise-linear lightness through (0, top), (seedIdx, seedL), (10, bottom). */
export function lightnessLadder(top: number, seedIdx: number, seedL: number, bottom: number): number[] {
	return SCALE_KEYS.map((_, i) =>
		i <= seedIdx ? top + ((seedL - top) * i) / seedIdx : seedL + ((bottom - seedL) * (i - seedIdx)) / (10 - seedIdx),
	);
}

/**
 * An 11-step scale at the seed's Oklch hue: step `seedKey` is the seed itself, every other step
 * is (L[i], chroma[i]) gamut-mapped. `hue` overrides the seed hue (tinted neutrals use the seed's).
 */
export function buildScale(seed: string, seedKey: string | null, Ls: number[], chroma: number[]): Record<string, string> {
	const s = oklchOfHex(seed);
	return Object.fromEntries(
		SCALE_KEYS.map((k, i) => [k, k === seedKey ? seed : hexOfOklch(Ls[i] as number, chroma[i] as number, s.H)]),
	);
}

export const cssLines = (prefix: string, scale: Record<string, string>): string =>
	SCALE_KEYS.map((k) => `--${prefix}-${k}: ${scale[k]};`).join("\n");

/** A role -> [L, C, hue] table turned into hex (hue in degrees, gamut-mapped by chroma reduction). */
export function tokensFrom(table: Record<string, [number, number, number]>): Record<string, string> {
	return Object.fromEntries(Object.entries(table).map(([k, [L, C, H]]) => [k, hexOfOklch(L, C, H)]));
}
