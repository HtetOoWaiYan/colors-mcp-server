import {
	gamutMap,
	normHue,
	type Oklch,
	type Rgb,
	rgbToOklch,
} from "./color.js";

export const SCHEMES = {
	complementary: [0, 180],
	"split-complementary": [0, 150, 210],
	triadic: [0, 120, 240],
	tetradic: [0, 90, 180, 270],
	analogous: [-30, 0, 30],
} as const;
export type Scheme = keyof typeof SCHEMES;
export const SCHEME_NAMES = Object.keys(SCHEMES) as Scheme[];

export interface HarmonyColor {
	rgb: Rgb;
	offset: number;
	chromaKept: number;
}

// Where the gamut cuts chroma by more than 15%, lightness may shift up to 0.06 to keep the color vivid.
export function harmony(
	base: Rgb,
	scheme: Scheme,
	offsets: readonly number[] = SCHEMES[scheme],
): HarmonyColor[] {
	const b = rgbToOklch(base);
	return offsets.map((offset) => {
		const target: Oklch = { l: b.l, c: b.c, h: normHue(b.h + offset) };
		let best = gamutMap(target);
		if (b.c > 0 && best.oklch.c < 0.85 * b.c) {
			for (let dl = -0.06; dl <= 0.0601; dl += 0.01) {
				const cand = gamutMap({ ...target, l: b.l + dl });
				if (cand.oklch.c > best.oklch.c + 1e-4) best = cand;
			}
		}
		return {
			rgb: best.rgb,
			offset,
			chromaKept: b.c === 0 ? 1 : Math.min(1, best.oklch.c / b.c),
		};
	});
}
