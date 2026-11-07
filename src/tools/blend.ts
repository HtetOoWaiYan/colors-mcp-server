import { z } from "zod";
import { gradient, mixAt } from "../engine/blend.js";
import { defineTool } from "./define.js";
import { colorsField, guarded, hex, parseAll, text } from "./shared.js";

const input = z.object({
	colors: colorsField(
		"The colors to blend between, in order. 2 to 8 stops.",
		8,
	).refine((a) => a.length >= 2, "Pass at least two colors to blend between."),
	steps: z
		.number()
		.int()
		.min(2)
		.max(40)
		.default(5)
		.describe("How many colors to return, endpoints included. Default 5."),
	space: z
		.enum(["oklch", "oklab", "srgb", "srgb-linear"], {
			error: 'space must be "oklch", "oklab", "srgb" or "srgb-linear".',
		})
		.default("oklch")
		.describe(
			'Interpolation space. "oklch" (default) keeps colors vivid and takes the shorter hue path; "oklab" is smooth but can dull; "srgb" matches old CSS gradients and goes muddy between far-apart hues; "srgb-linear" mixes in linear light (physical light mixing).',
		),
	at: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe(
			"Return just ONE blended color at this position between the first two colors (0 = first, 0.5 = even mix, 1 = second). Overrides steps.",
		),
});

const output = z.object({
	space: z.string(),
	colors: z.array(z.string()),
});

export const blendTool = defineTool({
	name: "colors_blend",
	title: "Blend or build a gradient",
	description:
		"Mix colors or build a gradient between 2+ colors. Returns evenly spaced hex colors with both endpoints included, interpolated in OKLCH so midpoints stay clean (no gray mud). Set `at` for one mixed color (0.5 = even mix). Always in sRGB gamut.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const parsed = parseAll(args.colors);
		if ("error" in parsed) return parsed.error;
		const rgbs = parsed.ok.map((p) => p.rgb);
		const how =
			args.space === "oklch"
				? "OKLCH, shorter hue path"
				: args.space.toUpperCase();
		if (args.at !== undefined) {
			const c = hex(
				mixAt(rgbs[0] as never, rgbs[1] as never, args.at, args.space),
			);
			return text(
				`Mix at ${args.at} between ${hex(rgbs[0] as never)} and ${hex(rgbs[1] as never)}: ${c} (interpolated in ${how}).`,
				{ space: args.space, colors: [c] },
			);
		}
		const colors = gradient(rgbs, args.steps, args.space).map((c) => hex(c));
		return text(
			`${colors.length}-step gradient in ${how}, endpoints included:\n${colors.join(", ")}`,
			{ space: args.space, colors },
		);
	}),
});
