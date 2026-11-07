import { z } from "zod";
import { compositeOver, type Rgb } from "../engine/color.js";
import { type FindRules, findColors } from "../engine/find.js";
import type { Cvd } from "../engine/vision.js";
import { defineTool } from "./define.js";
import { fail, fmt, guarded, hex, parseOne, text } from "./shared.js";

const degrees = z.number().min(0).max(360);

const input = z.object({
	count: z
		.number()
		.int()
		.min(1)
		.max(12)
		.default(1)
		.describe("How many colors to find. Default 1."),
	hueMin: degrees
		.optional()
		.describe(
			"OKLCH hue band start, degrees 0-360 (red 30, yellow 100, green 145, cyan 200, blue 260, purple 305, pink 350). If hueMin is above hueMax the band wraps through 0.",
		),
	hueMax: degrees.optional().describe("OKLCH hue band end, degrees 0-360."),
	chromaMin: z
		.number()
		.min(0)
		.max(0.4)
		.optional()
		.describe("Minimum OKLCH chroma (0 gray, 0.1 muted, 0.2 vivid)."),
	chromaMax: z
		.number()
		.min(0)
		.max(0.4)
		.optional()
		.describe("Maximum OKLCH chroma."),
	lightnessMin: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Minimum OKLCH lightness, 0 black to 1 white."),
	lightnessMax: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Maximum OKLCH lightness."),
	against: z
		.array(
			z.object({
				color: z.string().min(1).describe("Background or surface color."),
				ratio: z
					.number()
					.min(1)
					.max(21)
					.default(4.5)
					.describe("WCAG 2 contrast ratio needed against it. Default 4.5."),
			}),
		)
		.max(6)
		.optional()
		.describe(
			"Every found color must reach the ratio against each of these colors, for example a light and a dark surface.",
		),
	minLightnessGap: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe(
			"Several colors: minimum OKLab lightness difference between every pair (keeps them apart in grayscale).",
		),
	minHueGap: z
		.number()
		.min(0)
		.max(180)
		.optional()
		.describe(
			"Several colors: minimum OKLCH hue difference in degrees between every pair of colorful colors.",
		),
	minDeltaE: z
		.number()
		.min(0)
		.max(100)
		.optional()
		.describe(
			"Several colors: minimum CIEDE2000 difference between every pair. Default 15 when no other pair rule is given.",
		),
	cvd: z
		.enum(["none", "all", "deuteranopia", "protanopia", "tritanopia"], {
			error:
				'cvd must be "none", "all", "deuteranopia", "protanopia" or "tritanopia".',
		})
		.default("none")
		.describe(
			'Several colors: also keep every pair apart (minDeltaE) under this color blindness. "all" covers the three common types. Default "none".',
		),
});

const output = z.object({
	found: z.boolean(),
	allRulesHold: z.boolean(),
	colors: z.array(z.string()),
	details: z
		.array(
			z.object({
				color: z.string(),
				lightness: z.number(),
				chroma: z.number(),
				hue: z.number(),
				contrast: z.array(z.number()),
			}),
		)
		.optional(),
	pairs: z
		.object({
			lightnessGap: z.number(),
			hueGap: z.number().nullable(),
			deltaE: z.number(),
			cvd: z.record(z.string(), z.number()),
		})
		.optional(),
});

export const findTool = defineTool({
	name: "colors_find",
	title: "Find colors that meet rules",
	description:
		"Find colors that satisfy your rules in one call. Combine any of: hue band, chroma range, lightness range, contrast against one or more backgrounds (`against`), and for several colors a minimum lightness gap, hue gap or color difference (optionally color-blind safe). Returns verified hex colors with the most margin, or says which rule cannot be met.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		if ((args.hueMin === undefined) !== (args.hueMax === undefined))
			return fail("Give both hueMin and hueMax, or neither.");
		const against: { rgb: Rgb; ratio: number }[] = [];
		for (const [i, a] of (args.against ?? []).entries()) {
			const p = parseOne(a.color, `against[${i}].color`);
			if ("error" in p) return p.error;
			against.push({
				rgb: compositeOver(p.ok.rgb, p.ok.alpha, [1, 1, 1]),
				ratio: a.ratio,
			});
		}
		const cvd: Cvd[] =
			args.cvd === "none"
				? []
				: args.cvd === "all"
					? ["protanopia", "deuteranopia", "tritanopia"]
					: [args.cvd as Cvd];
		const rules: FindRules = {
			count: args.count,
			hue:
				args.hueMin !== undefined && args.hueMax !== undefined
					? [args.hueMin % 360, args.hueMax % 360]
					: undefined,
			chroma: { min: args.chromaMin, max: args.chromaMax },
			lightness: { min: args.lightnessMin, max: args.lightnessMax },
			against,
			minLightnessGap: args.minLightnessGap,
			minHueGap: args.minHueGap,
			minDeltaE: args.minDeltaE,
			cvd,
		};
		const r = findColors(rules);
		if (!r.ok)
			return text(r.reason, { found: false, allRulesHold: false, colors: [] });
		const colors = r.colors.map((c) => hex(c.rgb));
		const details = r.colors.map((c) => ({
			color: hex(c.rgb),
			lightness: Number(c.l.toFixed(3)),
			chroma: Number(c.c.toFixed(3)),
			hue: Number(c.h.toFixed(0)),
			contrast: c.contrast.map((v) => Number(v.toFixed(2))),
		}));
		const lines = details.map(
			(d) =>
				`${d.color}: L ${d.lightness}, C ${d.chroma}, H ${d.hue}${d.contrast.length ? `, contrast ${d.contrast.join(" / ")}:1` : ""}`,
		);
		const pairs = r.pair
			? {
					lightnessGap: Number(r.pair.lightnessGap.toFixed(3)),
					hueGap:
						r.pair.hueGap === null ? null : Number(r.pair.hueGap.toFixed(0)),
					deltaE: Number(r.pair.deltaE.toFixed(1)),
					cvd: Object.fromEntries(
						Object.entries(r.pair.cvd).map(([k, v]) => [
							k,
							Number(v.toFixed(1)),
						]),
					),
				}
			: undefined;
		const pairText = pairs
			? `\nWeakest pair: lightness gap ${fmt(pairs.lightnessGap, 3)}, hue gap ${pairs.hueGap === null ? "n/a" : `${pairs.hueGap} degrees`}, color difference ${pairs.deltaE}${Object.entries(
					pairs.cvd,
				)
					.map(([k, v]) => `, ${k} ${v}`)
					.join("")}.`
			: "";
		return text(
			`Found ${colors.length === 1 ? "1 color" : `${colors.length} colors`} that meet every rule: ${colors.join(", ")}\n${lines.join("\n")}${pairText}`,
			{
				found: true,
				allRulesHold: true,
				colors,
				details,
				...(pairs ? { pairs } : {}),
			},
		);
	}),
});
