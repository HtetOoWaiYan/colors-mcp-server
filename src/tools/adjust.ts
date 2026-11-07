import { z } from "zod";
import { gamutMap, normHue, type Oklch, rgbToOklch } from "../engine/color.js";
import { defineTool } from "./define.js";
import { colorsField, fmt, guarded, hex, parseAll, text } from "./shared.js";

const input = z.object({
	colors: colorsField("Colors to adjust.", 50),
	property: z
		.enum(["lightness", "chroma", "hue"], {
			error: 'property must be "lightness", "chroma" or "hue".',
		})
		.describe(
			"What to change, in OKLCH: lightness (0 black to 1 white), chroma (colorfulness, about 0 to 0.4), or hue (degrees, 0 to 360).",
		),
	mode: z
		.enum(["add", "multiply", "set"], {
			error: 'mode must be "add", "multiply" or "set".',
		})
		.default("add")
		.describe(
			'"add" the amount (negative lowers it), "multiply" by the amount (0.5 halves chroma), or "set" the property to the amount. Default "add".',
		),
	amount: z
		.number()
		.describe(
			"The number to add, multiply by, or set. Lightness and chroma are on the OKLCH scale (add -0.1 lightness = a bit darker); hue is in degrees.",
		),
});

const output = z.object({
	results: z.array(
		z.object({
			input: z.string(),
			output: z.string(),
			gamutMapped: z.boolean(),
		}),
	),
});

export const adjustTool = defineTool({
	name: "colors_adjust",
	title: "Adjust colors",
	description:
		'Make colors lighter, darker, more or less colorful, or rotate the hue, by exact OKLCH amounts. Changes only the property you name; the result is always a valid sRGB hex (chroma is lowered if the color would leave the gamut). Examples: {property:"lightness",mode:"add",amount:-0.1}; {property:"hue",mode:"add",amount:40}; {property:"chroma",mode:"multiply",amount:0.6}.',
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const parsed = parseAll(args.colors);
		if ("error" in parsed) return parsed.error;
		const lines: string[] = [];
		const results = parsed.ok.map((p, i) => {
			const o = rgbToOklch(p.rgb);
			const t: Oklch = { ...o };
			const key =
				args.property === "lightness"
					? "l"
					: args.property === "chroma"
						? "c"
						: "h";
			t[key] =
				args.mode === "add"
					? o[key] + args.amount
					: args.mode === "multiply"
						? o[key] * args.amount
						: args.amount;
			if (key === "h") t.h = normHue(t.h);
			if (key === "c") t.c = Math.max(0, t.c);
			if (key === "l") t.l = Math.min(1, Math.max(0, t.l));
			const m = gamutMap(t);
			const out = hex(m.rgb, p.alpha);
			lines.push(
				`${args.colors[i]} -> ${out}  (${args.property} ${fmt(o[key], 3)} -> ${fmt(m.oklch[key], 3)}${m.mapped ? "; chroma lowered to fit sRGB" : ""})`,
			);
			return {
				input: args.colors[i] as string,
				output: out,
				gamutMapped: m.mapped,
			};
		});
		const verb =
			args.mode === "add"
				? `${args.amount >= 0 ? "+" : ""}${args.amount}`
				: args.mode === "multiply"
					? `x${args.amount}`
					: `= ${args.amount}`;
		return text(
			`Adjusted OKLCH ${args.property} ${verb} for ${results.length} color${results.length === 1 ? "" : "s"}.\n${lines.join("\n")}`,
			{ results },
		);
	}),
});
