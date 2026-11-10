/**
 * Color-wheel harmonies on two stated wheels: the HSL hue of CSS hsl() (keep S and L) and the Oklch
 * hue (keep L and C; when the rotated color leaves sRGB, reduce chroma at constant L and H until it
 * fits).
 */
import { gamutMapOklch, inGamut, oklchToRgb } from "../reference/color.js";
import { hexOf, hslOfHex, hslToRgb, hueDist, oklchOfHex, type Rgb } from "./b-spaces.js";

export type Scheme = "complementary" | "split-complementary" | "triadic" | "tetradic" | "square" | "analogous";

/** Hue offsets from the base, base first. */
export const SCHEME_OFFSETS: Record<Scheme, readonly number[]> = {
	complementary: [0, 180],
	"split-complementary": [0, 150, 210],
	triadic: [0, 120, 240],
	tetradic: [0, 60, 180, 240],
	square: [0, 90, 180, 270],
	analogous: [0, 30, 330],
};
export const SCHEMES = Object.keys(SCHEME_OFFSETS) as Scheme[];

const norm = (h: number) => ((h % 360) + 360) % 360;

/** HSL wheel: rotate the hue, keep S and L. */
export function hslRotate(hex: string, deg: number): Rgb {
	const [h, s, l] = hslOfHex(hex);
	return hslToRgb([norm(h + deg), s, l]);
}
export const hslRotateHex = (hex: string, deg: number): string => hexOf(hslRotate(hex, deg));

/** HSL with one or more components replaced (S and L in 0..1). */
export function hslWith(hex: string, o: { h?: number; s?: number; l?: number }): string {
	const [h, s, l] = hslOfHex(hex);
	return hexOf(hslToRgb([o.h ?? h, o.s ?? s, o.l ?? l]));
}

/** Oklch wheel: rotate the hue, keep L and C, reduce C at constant L and H if out of sRGB. */
export function oklchRotate(hex: string, deg: number): { hex: string; reduced: boolean; L: number; C: number; H: number } {
	const [L, C, H] = oklchOfHex(hex);
	const target = { L, C, H: norm(H + deg) };
	const direct = oklchToRgb(target);
	if (inGamut(direct, 0)) return { hex: hexOf(direct), reduced: false, ...target };
	const m = gamutMapOklch(target);
	return { hex: hexOf(m.rgb), reduced: true, ...m.oklch };
}

/** Chroma headroom: the largest C (at the rotated hue and same L) that still fits in sRGB. */
export function oklchMaxChroma(L: number, H: number): number {
	return gamutMapOklch({ L, C: 0.5, H }).oklch.C;
}

/**
 * Worst member-hue error if the hue set is read as `scheme` with any member as the base: for each
 * candidate base, rotate the expected offsets onto the hues and pair them greedily by nearest. Returns
 * Infinity when the set size differs.
 */
export function schemeError(hues: readonly number[], scheme: Scheme): number {
	const offs = SCHEME_OFFSETS[scheme];
	if (offs.length !== hues.length) return Number.POSITIVE_INFINITY;
	let best = Number.POSITIVE_INFINITY;
	for (const base of hues) {
		const expected = offs.map((o) => norm(base + o));
		// Each expected hue must have a distinct nearest member; take the worst distance.
		const used = new Set<number>();
		let worst = 0;
		for (const e of expected) {
			let bi = -1;
			let bd = Number.POSITIVE_INFINITY;
			hues.forEach((h, i) => {
				if (used.has(i)) return;
				const d = hueDist(h, e);
				if (d < bd) {
					bd = d;
					bi = i;
				}
			});
			used.add(bi);
			worst = Math.max(worst, bd);
		}
		best = Math.min(best, worst);
	}
	return best;
}

export const hslHues = (hexes: readonly string[]): number[] => hexes.map((h) => hslOfHex(h)[0]);
export const oklchHues = (hexes: readonly string[]): number[] => hexes.map((h) => oklchOfHex(h)[2]);
