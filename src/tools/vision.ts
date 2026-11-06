import { z } from "zod";
import {
	CVD_TYPES,
	type Cvd,
	minSeparation,
	simulate,
} from "../engine/vision.js";
import { defineTool } from "./define.js";
import { colorsField, fmt, guarded, hex, parseAll, text } from "./shared.js";

const TYPES = ["all", ...CVD_TYPES] as const;

const input = z.object({
	colors: colorsField("Colors to simulate (and compare with each other).", 20),
	type: z
		.enum(TYPES, { error: `type must be one of: ${TYPES.join(", ")}.` })
		.default("all")
		.describe(
			'Which color vision to simulate. "deuteranopia" and "protanopia" are red-green; "tritanopia" is blue-yellow; "achromatopsia" is no color; "all" (default) runs all four.',
		),
	minDifference: z
		.number()
		.min(1)
		.max(50)
		.default(10)
		.describe(
			"A pair counts as distinguishable when its CIEDE2000 difference is at least this. Default 10.",
		),
});

const output = z.object({
	allDistinguishable: z.boolean().optional(),
	simulations: z.record(z.string(), z.array(z.string())),
	separation: z.record(z.string(), z.number()),
});

export const visionTool = defineTool({
	name: "colors_vision",
	title: "Color blindness simulation",
	description:
		'Simulate how colors look with color blindness (Machado 2009 model) and, for 2+ colors, measure whether the set stays distinguishable: returns the weakest pair per vision type. Use to check chart or status colors, or to find out if red/green pairs will collide. To BUILD a color-blind-safe set use colors_palette with kind "categorical".',
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const parsed = parseAll(args.colors);
		if ("error" in parsed) return parsed.error;
		const rgbs = parsed.ok.map((p) => p.rgb);
		const types: Cvd[] =
			args.type === "all" ? [...CVD_TYPES] : [args.type as Cvd];
		const simulations: Record<string, string[]> = {};
		for (const t of types)
			simulations[t] = rgbs.map((c) => hex(simulate(c, t)));
		const separation: Record<string, number> = {};
		const lines: string[] = [];
		let allOk = true;
		for (const t of types)
			lines.push(
				`${t}: ${args.colors.map((_c, i) => `${hex(rgbs[i] as never)} -> ${simulations[t]?.[i]}`).join(", ")}`,
			);
		if (rgbs.length >= 2) {
			for (const v of [null, ...types] as (Cvd | null)[]) {
				const s = minSeparation(rgbs, v);
				const key = v ?? "normal";
				separation[key] = Number(s.min.toFixed(2));
				const ok = s.min >= args.minDifference;
				if (v && !ok) allOk = false;
				lines.push(
					`${ok ? "OK  " : "WEAK"} ${key}: closest pair is ${hex(rgbs[s.pair[0]] as never)} vs ${hex(rgbs[s.pair[1]] as never)}, ΔE00 ${fmt(s.min)}${ok ? "" : ` (below ${args.minDifference})`}`,
				);
			}
		}
		const head =
			rgbs.length < 2
				? `Simulated ${types.length} vision type${types.length === 1 ? "" : "s"} for ${rgbs.length} color.`
				: allOk
					? `All colors stay distinguishable (ΔE00 ≥ ${args.minDifference}) under ${types.join(", ")}.`
					: `Some colors become hard to tell apart under color blindness (ΔE00 < ${args.minDifference}).`;
		return text(`${head}\n${lines.join("\n")}`, {
			...(rgbs.length >= 2 ? { allDistinguishable: allOk } : {}),
			simulations,
			separation,
		});
	}),
});
