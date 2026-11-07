import { z } from "zod";
import { deltaE2000, deltaEOk, describeDeltaE } from "../engine/distance.js";
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
	color: colorField("The reference color"),
	candidates: colorsField("Colors to compare against the reference.", 100),
	metric: z
		.enum(["ciede2000", "oklab"], {
			error: 'metric must be "ciede2000" or "oklab".',
		})
		.default("ciede2000")
		.describe(
			'"ciede2000" (default, the standard perceptual difference, ΔE00) or "oklab" (Euclidean distance in Oklab).',
		),
});

const output = z.object({
	metric: z.string(),
	nearest: z.string(),
	ranking: z.array(
		z.object({ color: z.string(), distance: z.number(), reading: z.string() }),
	),
});

export const compareTool = defineTool({
	name: "colors_compare",
	title: "Compare colors",
	description:
		"Measure how different colors look from a reference using CIEDE2000 (ΔE00): returns the nearest candidate and a full ranking, closest first. Use for 'which color is closest', 'are these the same color', or matching to a palette. Under 1 is not noticeable; over 10 is very different.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const ref = parseOne(args.color, "color");
		if ("error" in ref) return ref.error;
		const cands = parseAll(args.candidates, "candidates");
		if ("error" in cands) return cands.error;
		const dist = args.metric === "oklab" ? deltaEOk : deltaE2000;
		const ranking = cands.ok
			.map((c, i) => ({
				color: hex(c.rgb),
				original: args.candidates[i] as string,
				distance: dist(ref.ok.rgb, c.rgb),
			}))
			.sort((a, b) => a.distance - b.distance)
			.map((r) => ({
				color: r.color,
				distance: Number(r.distance.toFixed(args.metric === "oklab" ? 4 : 2)),
				reading: args.metric === "oklab" ? "" : describeDeltaE(r.distance),
			}));
		const near = ranking[0];
		if (!near) return text("No candidates.", undefined, true);
		const name = args.metric === "oklab" ? "Oklab distance" : "ΔE00";
		const head = `Nearest to ${hex(ref.ok.rgb)}: ${near.color} (${name} ${fmt(near.distance, args.metric === "oklab" ? 4 : 2)}${near.reading ? `, ${near.reading}` : ""}).`;
		const lines = ranking.map(
			(r, i) =>
				`${i + 1}. ${r.color}  ${fmt(r.distance, args.metric === "oklab" ? 4 : 2)}${r.reading ? `  ${r.reading}` : ""}`,
		);
		return text(
			`${head}\nRanking, closest first (${args.metric === "oklab" ? "Oklab Euclidean" : "CIEDE2000, D65 Lab"}):\n${lines.join("\n")}`,
			{
				metric: args.metric,
				nearest: near.color,
				ranking,
			},
		);
	}),
});
