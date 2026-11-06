import { z } from "zod";
import { categorical } from "../engine/categorical.js";
import { compositeOver, type Rgb } from "../engine/color.js";
import { buildRamp, stepNames } from "../engine/ramp.js";
import {
	buildTheme,
	checkTheme,
	type RuleResult,
	THEME_TOKENS,
} from "../engine/theme.js";
import type { Cvd } from "../engine/vision.js";
import { defineTool } from "./define.js";
import { fail, fmt, guarded, hex, parseOne, text } from "./shared.js";

const input = z.object({
	kind: z
		.enum(["ramp", "theme", "categorical"], {
			error: 'kind must be "ramp", "theme" or "categorical".',
		})
		.describe(
			'"ramp" = tonal scale (50..950) of one color; "theme" = light + dark UI tokens from a brand color; "categorical" = a set of clearly different colors for charts or tags.',
		),
	color: z
		.string()
		.optional()
		.describe(
			'Seed color. Required for "ramp" and "theme" (the brand color). Ignored for "categorical".',
		),
	steps: z
		.number()
		.int()
		.min(3)
		.max(19)
		.default(11)
		.describe(
			"Ramp only: number of steps, default 11 (named 50, 100 ... 950).",
		),
	count: z
		.number()
		.int()
		.min(2)
		.max(12)
		.default(5)
		.describe("Categorical only: how many colors. Default 5."),
	background: z
		.string()
		.default("#ffffff")
		.describe(
			'Categorical only: the background the colors sit on. Default "#ffffff".',
		),
	cvd: z
		.enum(["all", "deuteranopia", "protanopia", "tritanopia", "none"], {
			error:
				'cvd must be "all", "deuteranopia", "protanopia", "tritanopia" or "none".',
		})
		.default("all")
		.describe(
			'Categorical only: color-blindness types the set must survive. Default "all" (protan, deutan, tritan).',
		),
});

const output = z.object({
	kind: z.string(),
	colors: z.array(z.string()).optional(),
	names: z.array(z.string()).optional(),
	seedIndex: z.number().optional(),
	theme: z
		.object({
			light: z.record(z.string(), z.string()),
			dark: z.record(z.string(), z.string()),
		})
		.optional(),
	contrastRulesPassed: z.number().optional(),
	contrastRulesTotal: z.number().optional(),
	separation: z.record(z.string(), z.number()).optional(),
});

function tokensToHex(t: Record<string, Rgb>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const k of THEME_TOKENS) out[k] = hex(t[k] as Rgb);
	return out;
}

export const paletteTool = defineTool({
	name: "colors_palette",
	title: "Build a palette",
	description:
		'Build a finished color palette with verified accessibility. kind "ramp": an 11-step tonal scale of a color (lightest to darkest, the seed is one step, evenly spaced). kind "theme": light and dark UI tokens (background, surface, surface-raised, text, text-muted, border, primary, on-primary) from a brand color, with every text contrast rule checked. kind "categorical": N clearly different, color-blind-safe colors for charts. Returns hex values ready to use.',
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		if (args.kind === "categorical") {
			const bg = parseOne(args.background, "background");
			if ("error" in bg) return bg.error;
			const bgRgb = compositeOver(bg.ok.rgb, bg.ok.alpha, [1, 1, 1]);
			const cvd: Cvd[] =
				args.cvd === "none"
					? []
					: args.cvd === "all"
						? ["protanopia", "deuteranopia", "tritanopia"]
						: [args.cvd as Cvd];
			const r = categorical(args.count, {
				background: bgRgb,
				cvd,
				minContrast: 3,
				minNormalSeparation: 10,
			});
			if (!r)
				return fail(
					`Could not find ${args.count} colors that are all distinguishable on ${hex(bgRgb)}. Ask for fewer colors or set cvd to "none".`,
				);
			const colors = r.colors.map((c) => hex(c));
			const sep = Object.fromEntries(
				Object.entries(r.separation).map(([k, v]) => [k, Number(v.toFixed(1))]),
			);
			const sepText = Object.entries(sep)
				.map(([k, v]) => `${k} ${v}`)
				.join(", ");
			return text(
				`${colors.length} categorical colors for ${hex(bgRgb)} background, each at least 3:1 against it:\n${colors.join(", ")}\nWeakest pair difference (CIEDE2000; higher is better): ${sepText}. Vision types covered: ${cvd.length ? cvd.join(", ") : "none requested"}.`,
				{ kind: "categorical", colors, separation: sep },
			);
		}
		if (!args.color)
			return fail(
				`kind "${args.kind}" needs "color": the seed or brand color, e.g. {"kind":"${args.kind}","color":"#2563eb"}.`,
			);
		const seed = parseOne(args.color, "color");
		if ("error" in seed) return seed.error;
		if (args.kind === "ramp") {
			const ramp = buildRamp(seed.ok.rgb, args.steps);
			const colors = ramp.steps.map((c) => hex(c));
			const names = stepNames(args.steps);
			const lines = colors.map(
				(c, i) =>
					`${names[i]}: ${c}${i === ramp.seedIndex ? "  <- your color" : ""}`,
			);
			return text(
				`${args.steps}-step ramp for ${hex(seed.ok.rgb)}, lightest (${names[0]}) to darkest (${names[args.steps - 1]}), same hue, even OKLCH lightness steps. Your color is step ${names[ramp.seedIndex]}.\n${lines.join("\n")}\nList: ${colors.join(", ")}`,
				{ kind: "ramp", colors, names, seedIndex: ramp.seedIndex },
			);
		}
		const theme = buildTheme(seed.ok.rgb);
		const rules: RuleResult[] = checkTheme(theme);
		const passed = rules.filter((r) => r.pass).length;
		const light = tokensToHex(theme.light);
		const dark = tokensToHex(theme.dark);
		const adj = [
			theme.primaryAdjusted.light ? "light" : "",
			theme.primaryAdjusted.dark ? "dark" : "",
		].filter(Boolean);
		const notes = adj.length
			? `\nNote: the brand color was adjusted in the ${adj.join(" and ")} theme to stay readable (it is not exactly ${hex(seed.ok.rgb)} there).`
			: "\nThe brand color is used unchanged as primary in the light theme.";
		return text(
			`Theme for ${hex(seed.ok.rgb)}: all ${passed}/${rules.length} contrast rules pass in both themes (text 7:1 on background, muted text 4.5:1, on-primary 4.5:1, primary 3:1 on background).\nJSON: ${JSON.stringify({ light, dark })}${notes}\nSmallest margin: ${fmt(Math.min(...rules.map((r) => r.ratio / r.min)), 2)}x of the required ratio.`,
			{
				kind: "theme",
				theme: { light, dark },
				contrastRulesPassed: passed,
				contrastRulesTotal: rules.length,
			},
		);
	}),
});
