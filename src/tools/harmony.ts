import { z } from "zod";
import { rgbToOklch } from "../engine/color.js";
import {
	harmony,
	SCHEME_NAMES,
	SCHEMES,
	type Scheme,
} from "../engine/harmony.js";
import { defineTool } from "./define.js";
import { colorField, fmt, guarded, hex, parseOne, text } from "./shared.js";

const input = z.object({
	color: colorField("The base color"),
	scheme: z
		.enum(SCHEME_NAMES as [Scheme, ...Scheme[]], {
			error: `scheme must be one of: ${SCHEME_NAMES.join(", ")}.`,
		})
		.describe(
			`Color scheme: ${SCHEME_NAMES.map((s) => `${s} (hue offsets ${SCHEMES[s].join(", ")})`).join("; ")}.`,
		),
});

const output = z.object({
	scheme: z.string(),
	colors: z.array(
		z.object({
			color: z.string(),
			hueOffset: z.number(),
			chromaKept: z.number(),
		}),
	),
});

export const harmonyTool = defineTool({
	name: "colors_harmony",
	title: "Color harmony",
	description:
		"Generate a color scheme from a base color by rotating its OKLCH hue (complementary, split-complementary, triadic, tetradic, analogous) while keeping lightness and chroma matched. Returns hex colors with their hue offsets; the base is included at offset 0. OKLCH hue steps look even, unlike HSL angles.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const base = parseOne(args.color, "color");
		if ("error" in base) return base.error;
		const cols = harmony(base.ok.rgb, args.scheme);
		const bh = rgbToOklch(base.ok.rgb).h;
		const colors = cols.map((c) => ({
			color: hex(c.rgb),
			hueOffset: c.offset,
			chromaKept: Number(c.chromaKept.toFixed(2)),
		}));
		const weak = colors.filter((c) => c.chromaKept < 0.8);
		const lines = colors.map(
			(c) =>
				`${c.color}  ${c.hueOffset === 0 ? "base hue" : `hue ${c.hueOffset > 0 ? "+" : ""}${c.hueOffset}`} (OKLCH hue ${fmt((bh + c.hueOffset + 360) % 360, 0)})`,
		);
		const note = weak.length
			? `\nNote: ${weak.map((w) => w.color).join(", ")} lost some saturation because that hue cannot be as vivid in sRGB at this lightness.`
			: "";
		return text(
			`${args.scheme} scheme for ${hex(base.ok.rgb)} (${colors.length} colors, base at offset 0):\n${lines.join("\n")}${note}`,
			{ scheme: args.scheme, colors },
		);
	}),
});
