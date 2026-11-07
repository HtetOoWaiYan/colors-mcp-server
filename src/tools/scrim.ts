import { z } from "zod";
import { compositeOver, type Rgb } from "../engine/color.js";
import { minScrim } from "../engine/scrim.js";
import { defineTool } from "./define.js";
import {
	colorField,
	colorsField,
	fmt,
	guarded,
	hex,
	parseAll,
	parseOne,
	text,
} from "./shared.js";

const input = z.object({
	text: colorField("Text color that sits on the image"),
	overlay: colorField(
		"Overlay (scrim) color, usually black, white or a brand color",
	),
	regions: colorsField(
		"Colors of the busiest or worst-case parts of the image behind the text.",
		12,
	),
	target: z
		.number()
		.min(1)
		.max(21)
		.default(4.5)
		.describe(
			"Contrast ratio the text must reach on every region. Default 4.5.",
		),
	step: z
		.number()
		.min(0.005)
		.max(0.25)
		.default(0.05)
		.describe("Opacity grid, for example 0.05. Default 0.05."),
});

const output = z.object({
	found: z.boolean(),
	opacity: z.number().optional(),
	ratios: z.array(z.number()).optional(),
});

export const scrimTool = defineTool({
	name: "colors_scrim",
	title: "Smallest overlay for legible text on an image",
	description:
		"Text over a photo: find the smallest overlay (scrim) opacity at which the text reaches a contrast ratio on every worst-case region of the image. Painted like CSS, on 8-bit channels. Returns the opacity and the ratio on each region.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const t = parseOne(args.text, "text");
		if ("error" in t) return t.error;
		const o = parseOne(args.overlay, "overlay");
		if ("error" in o) return o.error;
		const regions = parseAll(args.regions, "regions");
		if ("error" in regions) return regions.error;
		const flat = (p: { rgb: Rgb; alpha: number }): Rgb =>
			compositeOver(p.rgb, p.alpha, [1, 1, 1]);
		const r = minScrim(
			flat(t.ok),
			flat(o.ok),
			regions.ok.map(flat),
			args.target,
			args.step,
		);
		if (!r)
			return text(
				`No overlay opacity from 0 to 1 makes ${hex(flat(t.ok))} reach ${args.target}:1 on every region with a ${hex(flat(o.ok))} overlay. Use an overlay color on the opposite side of the text in lightness, or lower the target.`,
				{ found: false },
			);
		const ratios = r.ratios.map((v) => Number(v.toFixed(2)));
		return text(
			`Use an overlay opacity of ${fmt(r.opacity, 3)} (${hex(flat(o.ok))} over the image). Text ${hex(flat(t.ok))} then reaches ${fmt(Math.min(...ratios))}:1 on the weakest region (target ${args.target}:1). Ratio per region: ${ratios.join(", ")}.`,
			{ found: true, opacity: r.opacity, ratios },
		);
	}),
});
