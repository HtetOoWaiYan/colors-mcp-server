import { z } from "zod";
import { compositeOver, hueDiff, rgbToOklch } from "../engine/color.js";
import { contrastRatio } from "../engine/contrast.js";
import { fixContrast } from "../engine/fix.js";
import { defineTool } from "./define.js";
import { fmt, guarded, hex, parseOne, text } from "./shared.js";

const input = z.object({
	foreground: z
		.string()
		.min(1)
		.describe("The text color that is too low in contrast. Any CSS color."),
	background: z
		.string()
		.min(1)
		.describe("The background color it sits on. Any CSS color."),
	target: z
		.number()
		.min(1.01, "target must be at least 1.01")
		.max(21, "target cannot exceed 21 (black on white)")
		.default(4.5)
		.describe(
			"Minimum contrast ratio to reach. 4.5 = WCAG AA text (default), 3 = large text or UI parts, 7 = AAA text.",
		),
	keepHue: z
		.boolean()
		.default(true)
		.describe(
			"Keep the original hue (within 15 degrees) so the color still reads as the same one. Default true.",
		),
});

const output = z.object({
	found: z.boolean(),
	changed: z.boolean(),
	color: z.string().optional(),
	ratio: z.number().optional(),
	originalRatio: z.number(),
	target: z.number(),
});

export const fixTool = defineTool({
	name: "colors_fix",
	title: "Fix contrast",
	description:
		"Make a text color readable: returns the closest color (same hue) that reaches the target contrast ratio on the given background. Use after a contrast check fails, or to pick an accessible text color. The background stays fixed. Returns one hex color and its verified ratio.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const fg = parseOne(args.foreground, "foreground");
		if ("error" in fg) return fg.error;
		const bg = parseOne(args.background, "background");
		if ("error" in bg) return bg.error;
		const bgRgb = compositeOver(bg.ok.rgb, bg.ok.alpha, [1, 1, 1]);
		const fgRgb = compositeOver(fg.ok.rgb, fg.ok.alpha, bgRgb);
		const originalRatio = Number(contrastRatio(fgRgb, bgRgb).toFixed(2));
		const r = fixContrast(fgRgb, bgRgb, args.target, args.keepHue);
		if (!r) {
			return text(
				`No color keeps the same hue and reaches ${args.target}:1 on ${hex(bgRgb)}. Retry with keepHue false, lower the target, or change the background.`,
				{ found: false, changed: false, originalRatio, target: args.target },
			);
		}
		if (!r.changed) {
			return text(
				`Already passes: ${hex(fgRgb)} on ${hex(bgRgb)} is ${fmt(originalRatio)}:1 (needs ${args.target}:1). No change needed.`,
				{
					found: true,
					changed: false,
					color: hex(fgRgb),
					ratio: originalRatio,
					originalRatio,
					target: args.target,
				},
			);
		}
		const o = rgbToOklch(fgRgb);
		const n = rgbToOklch(r.rgb);
		const dh = hueDiff(o.h, n.h);
		const ratio = Number(r.ratio.toFixed(2));
		const detail = `Lightness ${fmt(o.l)} -> ${fmt(n.l)}${o.c >= 0.04 ? `, hue shift ${fmt(dh, 1)} degrees` : ""}.`;
		return text(
			`Use ${hex(r.rgb)} (was ${hex(fgRgb)}). Contrast on ${hex(bgRgb)} is ${fmt(ratio)}:1, up from ${fmt(originalRatio)}:1; target ${args.target}:1 met. ${detail}`,
			{
				found: true,
				changed: true,
				color: hex(r.rgb),
				ratio,
				originalRatio,
				target: args.target,
			},
		);
	}),
});
