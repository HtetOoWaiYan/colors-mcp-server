import { z } from "zod";
import {
	ColorError,
	compositeOver,
	inGamut,
	parseColor,
	rgbToOklch,
} from "../engine/color.js";
import { contrastRatio } from "../engine/contrast.js";
import { formatColor, nearestName } from "../engine/format.js";
import { defineTool } from "./define.js";
import { colorsField, fmt, guarded, hex, text } from "./shared.js";

const input = z.object({
	colors: colorsField("Colors to describe or validate.", 20),
});

const item = z.object({
	input: z.string(),
	valid: z.boolean(),
	error: z.string().optional(),
	hex: z.string().optional(),
	alpha: z.number().optional(),
	rgb: z.string().optional(),
	hsl: z.string().optional(),
	oklch: z.string().optional(),
	name: z.string().optional(),
	exactName: z.boolean().optional(),
	lightness: z.string().optional(),
	inSrgbGamut: z.boolean().optional(),
	contrastOnWhite: z.number().optional(),
	contrastOnBlack: z.number().optional(),
	bestTextColor: z.string().optional(),
});
const output = z.object({ results: z.array(item) });

function lightnessWord(l: number): string {
	if (l < 0.25) return "very dark";
	if (l < 0.45) return "dark";
	if (l < 0.65) return "medium";
	if (l < 0.85) return "light";
	return "very light";
}

export const infoTool = defineTool({
	name: "colors_info",
	title: "Describe or validate colors",
	description:
		"Validate color strings and describe each: hex, rgb, hsl, oklch, closest CSS name, how light it is, whether it fits sRGB, and contrast against white and black (so you can pick black or white text). Use to check that an input is a real color, or to understand an unfamiliar color. Bad inputs are reported per color, with a suggestion.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const results = args.colors.map((raw) => {
			try {
				const p = parseColor(raw);
				const flat = compositeOver(p.rgb, p.alpha, [1, 1, 1]);
				const o = rgbToOklch(p.rgb);
				const name = nearestName(p.rgb);
				const onWhite = contrastRatio(flat, [1, 1, 1]);
				const onBlack = contrastRatio(flat, [0, 0, 0]);
				return {
					input: raw,
					valid: true as const,
					hex: hex(p.rgb, p.alpha),
					alpha: Number(p.alpha.toFixed(3)),
					rgb: formatColor(p.rgb, p.alpha, "rgb").text,
					hsl: formatColor(p.rgb, p.alpha, "hsl", 1).text,
					oklch: formatColor(p.rgb, p.alpha, "oklch").text,
					name: name.name,
					exactName: name.exact,
					lightness: lightnessWord(o.l),
					inSrgbGamut: inGamut(p.rgb),
					contrastOnWhite: Number(onWhite.toFixed(2)),
					contrastOnBlack: Number(onBlack.toFixed(2)),
					bestTextColor: onBlack >= onWhite ? "#000000" : "#ffffff",
				};
			} catch (e) {
				return {
					input: raw,
					valid: false as const,
					error: e instanceof ColorError ? e.message : String(e),
				};
			}
		});
		const bad = results.filter((r) => !r.valid).length;
		const head =
			bad === 0
				? results.length === 1
					? "Valid color."
					: `All ${results.length} colors are valid.`
				: `${bad} of ${results.length} inputs are NOT valid colors.`;
		const lines = results.map((r) =>
			r.valid
				? `${r.input} -> ${r.hex} | ${r.rgb} | ${r.hsl} | ${r.oklch} | ${r.exactName ? "named" : "closest name"} ${r.name} | ${r.lightness}${r.inSrgbGamut ? "" : " | outside sRGB gamut"} | on white ${fmt(r.contrastOnWhite ?? 0)}:1, on black ${fmt(r.contrastOnBlack ?? 0)}:1 (best text: ${r.bestTextColor})`
				: `${JSON.stringify(r.input)} -> INVALID. ${r.error}`,
		);
		return text(`${head}\n${lines.join("\n")}`, { results });
	}),
});
