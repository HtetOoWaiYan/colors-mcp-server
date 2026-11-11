import Color from "colorjs.io";
import keywords from "colorjs.io/src/keywords.js";
import {
	clamp01,
	gamutMap,
	normHue,
	type Rgb,
	rgbToHex,
	rgbToOklch,
} from "./color.js";
import { deltaE2000 } from "./distance.js";

export const FORMATS = [
	"hex",
	"rgb",
	"hsl",
	"hwb",
	"oklch",
	"oklab",
	"lab",
	"lch",
	"p3",
	"rec2020",
	"xyz",
	"linear",
	"hsv",
] as const;
export type Format = (typeof FORMATS)[number];

/** Spaces whose values are only meaningful for in-gamut sRGB colors. */
export const SRGB_FORMATS: Format[] = ["hex", "rgb", "hsl", "hwb", "hsv"];

/** Color.js reports a powerless hue (grays) as null; treat missing channels as 0. */
const zero = (v: number | null | undefined): number =>
	v === null || v === undefined || Number.isNaN(v) ? 0 : v;

const num = (v: number, p: number): string => {
	const r = Number(v.toFixed(p));
	return String(Object.is(r, -0) ? 0 : r);
};

export interface Formatted {
	text: string;
	gamut?: { fromChroma: number; toChroma: number };
}

export function formatColor(
	rgb: Rgb,
	alpha: number,
	to: Format,
	precision = 3,
): Formatted {
	let working = rgb;
	let gamut: Formatted["gamut"];
	if (SRGB_FORMATS.includes(to)) {
		const o = rgbToOklch(rgb);
		const m = gamutMap(o);
		if (m.mapped) {
			working = m.rgb;
			gamut = { fromChroma: o.c, toChroma: m.oklch.c };
		}
	}
	const a = alpha < 1 ? ` / ${num(alpha, 3)}` : "";
	const c = new Color("srgb", working.map((v) => v) as Rgb);
	switch (to) {
		case "hex":
			return { text: rgbToHex(working, alpha), gamut };
		case "rgb": {
			const [r, g, b] = working.map((v) =>
				num(clamp01(v) * 255, precision === 0 ? 0 : Math.min(precision, 2)),
			);
			return { text: `rgb(${r} ${g} ${b}${a})`, gamut };
		}
		case "hsl": {
			const [h, s, l] = c.to("hsl").coords.map(zero) as Rgb;
			return {
				text: `hsl(${num(h, precision)} ${num(s, precision)}% ${num(l, precision)}%${a})`,
				gamut,
			};
		}
		case "hwb": {
			const [h, w, b] = c.to("hwb").coords.map(zero) as Rgb;
			return {
				text: `hwb(${num(h, precision)} ${num(w, precision)}% ${num(b, precision)}%${a})`,
				gamut,
			};
		}
		case "oklch": {
			const o = rgbToOklch(rgb);
			return {
				text: `oklch(${num(o.l, precision)} ${num(o.c, precision)} ${num(o.c < 1e-4 ? 0 : o.h, precision)}${a})`,
			};
		}
		case "oklab": {
			const [l, aa, b] = new Color("srgb", rgb)
				.to("oklab")
				.coords.map(zero) as Rgb;
			return {
				text: `oklab(${num(l, precision)} ${num(aa, precision)} ${num(b, precision)}${a})`,
			};
		}
		case "lab": {
			const [l, aa, b] = new Color("srgb", rgb)
				.to("lab")
				.coords.map(zero) as Rgb;
			return {
				text: `lab(${num(l, precision)} ${num(aa, precision)} ${num(b, precision)}${a})`,
			};
		}
		case "lch": {
			const [l, cc, h] = new Color("srgb", rgb)
				.to("lch")
				.coords.map(zero) as Rgb;
			return {
				text: `lch(${num(l, precision)} ${num(cc, precision)} ${num(normHue(h), precision)}${a})`,
			};
		}
		case "rec2020": {
			const p = new Color("srgb", rgb)
				.to("rec2020")
				.toGamut({ space: "rec2020", method: "oklch.c" })
				.coords.map(zero) as Rgb;
			return {
				text: `color(rec2020 ${p.map((v) => num(v, precision)).join(" ")}${a})`,
			};
		}
		case "xyz": {
			const p = new Color("srgb", rgb).to("xyz-d65").coords.map(zero) as Rgb;
			return {
				text: `color(xyz-d65 ${p.map((v) => num(v, precision)).join(" ")}${a})`,
			};
		}
		case "linear": {
			const p = new Color("srgb", rgb)
				.to("srgb-linear")
				.coords.map(zero) as Rgb;
			return {
				text: `color(srgb-linear ${p.map((v) => num(v, precision)).join(" ")}${a})`,
			};
		}
		case "hsv": {
			const [h, s, v] = new Color("srgb", working)
				.to("hsv")
				.coords.map(zero) as Rgb;
			return {
				text: `hsv(${num(h, precision)} ${num(s, precision)}% ${num(v, precision)}%${a})`,
			};
		}
		case "p3": {
			const p = new Color("srgb", rgb)
				.to("p3")
				.toGamut({ space: "p3", method: "oklch.c" })
				.coords.map(zero) as Rgb;
			return {
				text: `color(display-p3 ${p.map((v) => num(v, precision)).join(" ")}${a})`,
			};
		}
	}
}

const NAMED_RGB: [string, Rgb][] = Object.entries(
	keywords as Record<string, Rgb>,
).map(([k, v]) => [k, [...v] as Rgb]);

export function nearestName(rgb: Rgb): { name: string; exact: boolean } {
	const hex = rgbToHex(rgb);
	let best = "";
	let bestD = Number.POSITIVE_INFINITY;
	for (const [name, v] of NAMED_RGB) {
		if (rgbToHex(v) === hex) return { name, exact: true };
		const d = deltaE2000(rgb, v);
		if (d < bestD) {
			bestD = d;
			best = name;
		}
	}
	return { name: best, exact: false };
}
