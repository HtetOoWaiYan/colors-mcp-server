import type { Rgb } from "./color.js";
import { contrastRatio } from "./contrast.js";

export interface ScrimResult {
	opacity: number;
	ratios: number[];
}

const to8 = (v: number): number => Math.round(v * 255);

/** CSS source-over on 8-bit channels, rounded per region before contrast is measured. */
function overlay(color: Rgb, alpha: number, region: Rgb): Rgb {
	return [0, 1, 2].map(
		(i) =>
			Math.round(
				alpha * to8(color[i] as number) +
					(1 - alpha) * to8(region[i] as number),
			) / 255,
	) as Rgb;
}

/** Smallest overlay opacity on a fixed grid at which the text reaches the ratio on every region. */
export function minScrim(
	text: Rgb,
	scrim: Rgb,
	regions: Rgb[],
	target: number,
	step: number,
): ScrimResult | null {
	const n = Math.round(1 / step);
	for (let k = 0; k <= n; k++) {
		const opacity = Math.round(k * step * 1e6) / 1e6;
		const ratios = regions.map((r) =>
			contrastRatio(text, overlay(scrim, opacity, r)),
		);
		if (ratios.every((v) => v >= target)) return { opacity, ratios };
	}
	return null;
}
