import Color from "colorjs.io";
import { clamp01, compositeOver, type Parsed, type Rgb } from "./color.js";

const lin = (v: number): number =>
	v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

export function relativeLuminance(rgb: Rgb): number {
	return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

// Hex output keeps only 8 bits per channel.
export const quantize = (rgb: Rgb): Rgb => [
	Math.round(clamp01(rgb[0]) * 255) / 255,
	Math.round(clamp01(rgb[1]) * 255) / 255,
	Math.round(clamp01(rgb[2]) * 255) / 255,
];

// Uses the 8-bit rounded colors, which is what a browser actually paints.
export function contrastRatio(a: Rgb, b: Rgb): number {
	const la = relativeLuminance(quantize(a));
	const lb = relativeLuminance(quantize(b));
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function apcaContrast(text: Rgb, bg: Rgb): number {
	const t = new Color("srgb", text.map(clamp01) as Rgb);
	const b = new Color("srgb", bg.map(clamp01) as Rgb);
	return b.contrastAPCA(t);
}

export type TextSize = "normal" | "large" | "ui";
export type Level = "AA" | "AAA";

// "ui" is non-text components (WCAG 1.4.11): 3:1, AA only.
export function requiredRatio(level: Level, size: TextSize): number {
	if (size === "ui") return 3;
	if (level === "AAA") return size === "large" ? 4.5 : 7;
	return size === "large" ? 3 : 4.5;
}

export function effectiveForeground(
	fg: Parsed,
	bg: Parsed,
	base: Rgb = [1, 1, 1],
): { fg: Rgb; bg: Rgb } {
	const bgOpaque = compositeOver(bg.rgb, bg.alpha, base);
	const fgOpaque = compositeOver(fg.rgb, fg.alpha, bgOpaque);
	return { fg: fgOpaque, bg: bgOpaque };
}
