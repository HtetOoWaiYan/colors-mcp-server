import { z } from "zod";
import {
	deltaE76,
	deltaE94,
	deltaE2000,
	deltaEOk,
	describeDeltaE,
} from "../engine/distance.js";
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
		.enum(["ciede2000", "cie94", "cie76", "oklab", "all"], {
			error: 'metric must be "ciede2000", "cie94", "cie76", "oklab" or "all".',
		})
		.default("ciede2000")
		.describe(
			'"ciede2000" (default, ΔE00), "cie94" (graphic-arts weights, reference chroma), "cie76" (Euclidean in CIELAB), "oklab" (Euclidean in Oklab) or "all" (every metric; ranked by ΔE00). Lab is D65, no adaptation.',
		),
});

const output = z.object({
	metric: z.string(),
	nearest: z.string(),
	ranking: z.array(
		z.object({
			color: z.string(),
			distance: z.number(),
			reading: z.string(),
			cie76: z.number().optional(),
			cie94: z.number().optional(),
			ciede2000: z.number().optional(),
			oklab: z.number().optional(),
		}),
	),
});

export const compareTool = defineTool({
	name: "colors_compare",
	title: "Compare colors",
	description:
		"Measure how different colors look from a reference: CIEDE2000 (ΔE00, default), CIE94, CIE76 or Oklab distance, or all of them at once. Returns the nearest candidate and a full ranking, closest first. Use for 'which color is closest', 'are these the same color', or matching to a palette. Under 1 is not noticeable; over 10 is very different.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const ref = parseOne(args.color, "color");
		if ("error" in ref) return ref.error;
		const cands = parseAll(args.candidates, "candidates");
		if ("error" in cands) return cands.error;
		const all = args.metric === "all";
		// "all" ranks by ΔE00, the default metric.
		const metric = args.metric === "all" ? "ciede2000" : args.metric;
		const METRICS = {
			ciede2000: {
				fn: deltaE2000,
				digits: 2,
				name: "ΔE00",
				long: "CIEDE2000, D65 Lab",
			},
			cie94: {
				fn: deltaE94,
				digits: 2,
				name: "ΔE94",
				long: "CIE94 graphic arts, D65 Lab",
			},
			cie76: { fn: deltaE76, digits: 2, name: "ΔE76", long: "CIE76, D65 Lab" },
			oklab: {
				fn: deltaEOk,
				digits: 4,
				name: "Oklab distance",
				long: "Oklab Euclidean",
			},
		} as const;
		const m = METRICS[metric];
		const ranking = cands.ok
			.map((c) => ({
				color: hex(c.rgb),
				distance: m.fn(ref.ok.rgb, c.rgb),
				rgb: c.rgb,
			}))
			.sort((a, b) => a.distance - b.distance)
			.map((r) => ({
				color: r.color,
				distance: Number(r.distance.toFixed(m.digits)),
				reading: metric === "oklab" ? "" : describeDeltaE(r.distance),
				...(all
					? {
							cie76: Number(deltaE76(ref.ok.rgb, r.rgb).toFixed(2)),
							cie94: Number(deltaE94(ref.ok.rgb, r.rgb).toFixed(2)),
							ciede2000: Number(deltaE2000(ref.ok.rgb, r.rgb).toFixed(2)),
							oklab: Number(deltaEOk(ref.ok.rgb, r.rgb).toFixed(4)),
						}
					: {}),
			}));
		const near = ranking[0];
		if (!near) return text("No candidates.", undefined, true);
		const head = `Nearest to ${hex(ref.ok.rgb)}: ${near.color} (${m.name} ${fmt(near.distance, m.digits)}${near.reading ? `, ${near.reading}` : ""}).`;
		const lines = ranking.map((r, i) =>
			all
				? `${i + 1}. ${r.color}  ΔE76 ${fmt(r.cie76 ?? 0)}, ΔE94 ${fmt(r.cie94 ?? 0)}, ΔE00 ${fmt(r.ciede2000 ?? 0)}, Oklab ${fmt(r.oklab ?? 0, 4)}`
				: `${i + 1}. ${r.color}  ${fmt(r.distance, m.digits)}${r.reading ? `  ${r.reading}` : ""}`,
		);
		const how = all
			? "all metrics, ranked by CIEDE2000; CIE94 uses graphic-arts weights with the reference's chroma; Lab is D65, no chromatic adaptation"
			: m.long;
		return text(
			`${head}\nRanking, closest first (${how}):\n${lines.join("\n")}`,
			{
				metric: args.metric,
				nearest: near.color,
				ranking,
			},
		);
	}),
});
