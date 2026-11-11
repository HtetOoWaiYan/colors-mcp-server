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
	"xyz-d65": "xyz",
	xyz65: "xyz",
	"srgb-linear": "linear",
	"linear-srgb": "linear",
	"linear-rgb": "linear",
	"rec.2020": "rec2020",
	bt2020: "rec2020-oetf",
	"bt.2020": "rec2020-oetf",
	"rec2020-bt2020": "rec2020-oetf",
	"linear-rec2020": "rec2020-linear",
	"cielab-d65": "lab-d65",
	lab65: "lab-d65",
	lch65: "lch-d65",
	hsb: "hsv",
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
		.describe(
			`Target format. "lab"/"lch" are the CSS ones (D50); "lab-d65"/"lch-d65" use the D65 white, no adaptation. "xyz" is D65, "linear" is linear sRGB, "p3" is display-p3, "rec2020" has a 2.4 gamma, "rec2020-oetf" the BT.2020 curve.`,
		),
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
		"Convert colors to another format: hex, rgb, hsl, hwb, hsv, oklch, oklab, CSS lab/lch (D50), lab-d65/lch-d65 (CIELAB, D65, no adaptation), xyz (D65), linear (linear sRGB), p3, rec2020 (CSS, 2.4 gamma), rec2020-oetf (BT.2020 transfer) or rec2020-linear. Reads any of them as input. Handles lists. A color outside sRGB (for hex/rgb/hsl/hwb) is mapped in by lowering chroma only, and the result says so.",
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
