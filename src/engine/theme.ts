import { gamutMap, type Rgb, rgbToOklch } from "./color.js";
import { contrastRatio } from "./contrast.js";

export const THEME_TOKENS = [
	"background",
	"surface",
	"surface-raised",
	"text",
	"text-muted",
	"border",
	"primary",
	"on-primary",
] as const;
export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeTokens = Record<ThemeToken, Rgb>;

export const THEME_RULES: { text: ThemeToken; on: ThemeToken; min: number }[] =
	[
		{ text: "text", on: "background", min: 7 },
		{ text: "text", on: "surface", min: 7 },
		{ text: "text", on: "surface-raised", min: 4.5 },
		{ text: "text-muted", on: "background", min: 4.5 },
		{ text: "text-muted", on: "surface", min: 4.5 },
		{ text: "text-muted", on: "surface-raised", min: 4.5 },
		{ text: "on-primary", on: "primary", min: 4.5 },
		{ text: "primary", on: "background", min: 3 },
		{ text: "border", on: "background", min: 1.5 },
	];

const WHITE: Rgb = [1, 1, 1];
const BLACK: Rgb = [0, 0, 0];
const bestOn = (bg: Rgb): Rgb =>
	contrastRatio(WHITE, bg) >= contrastRatio(BLACK, bg) ? WHITE : BLACK;

// Very low chroma at the brand hue, so surfaces feel related to the brand.
const tint = (h: number, l: number, c = 0.008): Rgb =>
	gamutMap({ l, c, h }).rgb;

function search(
	h: number,
	c: number,
	start: number,
	dir: 1 | -1,
	ok: (rgb: Rgb) => boolean,
): Rgb {
	let l = start;
	let rgb = tint(h, l, c);
	while (!ok(rgb) && l > 0 && l < 1) {
		l += dir * 0.005;
		rgb = tint(h, l, c);
	}
	return rgb;
}

export interface Theme {
	light: ThemeTokens;
	dark: ThemeTokens;
	primaryAdjusted: { light: boolean; dark: boolean };
}

function primaryFor(
	brand: Rgb,
	bg: Rgb,
	dir: 1 | -1,
): { rgb: Rgb; adjusted: boolean } {
	const b = rgbToOklch(brand);
	const ok = (rgb: Rgb) =>
		contrastRatio(rgb, bg) >= 3 && contrastRatio(bestOn(rgb), rgb) >= 4.5;
	if (ok(brand)) return { rgb: brand, adjusted: false };
	let l = b.l;
	let rgb = brand;
	while (!ok(rgb) && l + dir * 0.005 > 0 && l + dir * 0.005 < 1) {
		l += dir * 0.005;
		rgb = gamutMap({ l, c: b.c, h: b.h }).rgb;
	}
	return { rgb, adjusted: true };
}

export function buildTheme(brand: Rgb): Theme {
	const b = rgbToOklch(brand);
	const h = b.h;
	const make = (
		bgL: number,
		surfL: number,
		raisedL: number,
		textL: number,
		mutedStart: number,
		mutedDir: 1 | -1,
		borderL: number,
		primaryDir: 1 | -1,
	) => {
		const background = tint(h, bgL, bgL > 0.5 ? 0.003 : 0.012);
		const surface = tint(h, surfL, bgL > 0.5 ? 0.006 : 0.014);
		const raised = tint(h, raisedL, bgL > 0.5 ? 0.01 : 0.016);
		const text = tint(h, textL, 0.01);
		const muted = search(h, 0.012, mutedStart, mutedDir, (c) =>
			[background, surface, raised].every((s) => contrastRatio(c, s) >= 4.5),
		);
		const p = primaryFor(brand, background, primaryDir);
		const tokens: ThemeTokens = {
			background,
			surface,
			"surface-raised": raised,
			text,
			"text-muted": muted,
			border: tint(h, borderL, 0.01),
			primary: p.rgb,
			"on-primary": bestOn(p.rgb),
		};
		return { tokens, adjusted: p.adjusted };
	};
	const light = make(1, 0.97, 0.94, 0.2, 0.5, -1, 0.85, -1);
	const dark = make(0.16, 0.2, 0.25, 0.96, 0.7, 1, 0.34, 1);
	return {
		light: light.tokens,
		dark: dark.tokens,
		primaryAdjusted: { light: light.adjusted, dark: dark.adjusted },
	};
}

export interface RuleResult {
	theme: "light" | "dark";
	text: ThemeToken;
	on: ThemeToken;
	ratio: number;
	min: number;
	pass: boolean;
}

export function checkTheme(theme: Pick<Theme, "light" | "dark">): RuleResult[] {
	const out: RuleResult[] = [];
	for (const name of ["light", "dark"] as const) {
		for (const r of THEME_RULES) {
			const ratio = contrastRatio(theme[name][r.text], theme[name][r.on]);
			out.push({
				theme: name,
				text: r.text,
				on: r.on,
				ratio,
				min: r.min,
				pass: ratio >= r.min,
			});
		}
	}
	return out;
}
