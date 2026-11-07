import { z } from "zod";
import { FORMATS, type Format, formatColor } from "../engine/format.js";
import { defineTool } from "./define.js";
import { colorsField, guarded, parseAll, text } from "./shared.js";

const ALIASES: Record<string, Format> = {
	srgb: "rgb",
	"display-p3": "p3",
	displayp3: "p3",
	"color(display-p3)": "p3",
	hexadecimal: "hex",
	okl: "oklch",
};

const input = z.object({
	colors: colorsField("Colors to convert."),
	to: z
		.preprocess(
			(v) =>
				typeof v === "string"
					? (ALIASES[v.trim().toLowerCase()] ?? v.trim().toLowerCase())
					: v,
			z.enum(FORMATS, { error: `to must be one of: ${FORMATS.join(", ")}.` }),
		)
		.describe(`Target format: ${FORMATS.join(", ")}. "p3" means display-p3.`),
	precision: z
		.number()
		.int()
		.min(0)
		.max(8)
		.default(3)
		.describe("Decimal places. Default 3."),
});

const output = z.object({
	to: z.string(),
	results: z.array(
		z.object({
			input: z.string(),
			output: z.string(),
			gamutMapped: z.boolean(),
		}),
	),
});

export const convertTool = defineTool({
	name: "colors_convert",
	title: "Convert colors",
	description:
		"Convert colors to another format: hex, rgb, hsl, hwb, oklch, oklab, lab, lch or p3. Exact math, handles lists. If a color does not fit sRGB (for hex/rgb/hsl/hwb) it is mapped in by lowering chroma only (same lightness and hue) and the result says so. Use for any format change.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const parsed = parseAll(args.colors);
		if ("error" in parsed) return parsed.error;
		const lines: string[] = [];
		const results = parsed.ok.map((p, i) => {
			const f = formatColor(p.rgb, p.alpha, args.to, args.precision);
			const note = f.gamut
				? ` (outside sRGB: chroma lowered from ${f.gamut.fromChroma.toFixed(3)} to ${f.gamut.toChroma.toFixed(3)}, same lightness and hue)`
				: "";
			lines.push(`${args.colors[i]} -> ${f.text}${note}`);
			return {
				input: args.colors[i] as string,
				output: f.text,
				gamutMapped: Boolean(f.gamut),
			};
		});
		const mapped = results.filter((r) => r.gamutMapped).length;
		const head = `Converted ${results.length} color${results.length === 1 ? "" : "s"} to ${args.to}${mapped ? `; ${mapped} had to be gamut-mapped` : ""}.`;
		return text(`${head}\n${lines.join("\n")}`, { to: args.to, results });
	}),
});
