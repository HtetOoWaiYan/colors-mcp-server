import { z } from "zod";
import { compositeOver, type Rgb } from "../engine/color.js";
import {
	apcaContrast,
	contrastRatio,
	effectiveForeground,
	type Level,
	requiredRatio,
	type TextSize,
} from "../engine/contrast.js";
import { fixContrast } from "../engine/fix.js";
import { defineTool } from "./define.js";
import { fail, fmt, guarded, hex, parseOne, text } from "./shared.js";

const PairSchema = z.object({
	foreground: z.string().min(1).describe("Text or icon color."),
	background: z.string().min(1).describe("Background color."),
});

const input = z.object({
	foreground: z
		.string()
		.optional()
		.describe("Text color, for a single check. Any CSS color."),
	background: z
		.string()
		.optional()
		.describe("Background color, for a single check. Any CSS color."),
	pairs: z
		.array(PairSchema)
		.max(50)
		.optional()
		.describe(
			"Several checks at once: a list of {foreground, background}. Use instead of foreground/background.",
		),
	level: z
		.enum(["AA", "AAA"], { error: 'level must be "AA" or "AAA".' })
		.default("AA")
		.describe('WCAG level. Default "AA".'),
	size: z
		.enum(["normal", "large", "ui"], {
			error: 'size must be "normal", "large" or "ui".',
		})
		.default("normal")
		.describe(
			'"normal" text (default), "large" text (24px or 18.66px bold and up), or "ui" for non-text parts like borders and icons.',
		),
	base: z
		.string()
		.optional()
		.describe(
			'Color that translucent backgrounds are composited over. Default "#ffffff".',
		),
});

const output = z.object({
	allPass: z.boolean(),
	level: z.string(),
	size: z.string(),
	required: z.number(),
	results: z.array(
		z.object({
			foreground: z.string(),
			background: z.string(),
			ratio: z.number(),
			pass: z.boolean(),
			apca: z.number(),
			suggestion: z.string().optional(),
		}),
	),
});

const SIZE_LABEL: Record<TextSize, string> = {
	normal: "normal text",
	large: "large text",
	ui: "non-text UI",
};

export const checkTool = defineTool({
	name: "colors_check",
	title: "Check contrast",
	description:
		"Check WCAG 2 contrast for text/background color pairs and say PASS or FAIL for each, with the exact ratio and, for failures, a nearby passing color. Use whenever you must know if colors are readable or accessible. Handles translucent colors. Pass foreground+background, or pairs for many.",
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const raw =
			args.pairs && args.pairs.length > 0
				? args.pairs
				: args.foreground && args.background
					? [{ foreground: args.foreground, background: args.background }]
					: null;
		if (!raw) {
			return fail(
				'Give a foreground and a background color, e.g. {"foreground":"#777777","background":"#ffffff"}, or a list in "pairs".',
			);
		}
		let base: Rgb = [1, 1, 1];
		if (args.base) {
			const b = parseOne(args.base, "base");
			if ("error" in b) return b.error;
			base = compositeOver(b.ok.rgb, b.ok.alpha, [1, 1, 1]);
		}
		const level = args.level as Level;
		const size = args.size as TextSize;
		const required = requiredRatio(level, size);
		const results = [];
		for (const [i, p] of raw.entries()) {
			const fg = parseOne(p.foreground, `pairs[${i}].foreground`);
			if ("error" in fg) return fg.error;
			const bg = parseOne(p.background, `pairs[${i}].background`);
			if ("error" in bg) return bg.error;
			const eff = effectiveForeground(fg.ok, bg.ok, base);
			const ratio = contrastRatio(eff.fg, eff.bg);
			const pass = ratio >= required;
			let suggestion: string | undefined;
			if (!pass) {
				const fix = fixContrast(eff.fg, eff.bg, required);
				if (fix) suggestion = hex(fix.rgb);
			}
			results.push({
				foreground: hex(eff.fg),
				background: hex(eff.bg),
				ratio: Number(ratio.toFixed(2)),
				pass,
				apca: Number(Math.abs(apcaContrast(eff.fg, eff.bg)).toFixed(1)),
				...(suggestion ? { suggestion } : {}),
			});
		}
		const failed = results.filter((r) => !r.pass).length;
		const head =
			results.length === 1
				? `${results[0]?.pass ? "PASS" : "FAIL"}: ${fmt(results[0]?.ratio ?? 0)}:1, needs ${required}:1 for WCAG ${level} ${SIZE_LABEL[size]}.`
				: failed === 0
					? `All ${results.length} pairs PASS WCAG ${level} ${SIZE_LABEL[size]} (need ${required}:1).`
					: `${failed} of ${results.length} pairs FAIL WCAG ${level} ${SIZE_LABEL[size]} (need ${required}:1).`;
		const lines = results.map(
			(r, i) =>
				`${results.length > 1 ? `${i + 1}. ` : ""}${r.pass ? "PASS" : "FAIL"} ${r.foreground} on ${r.background}: ${fmt(r.ratio)}:1${r.suggestion ? `. Passing alternative text color: ${r.suggestion} (use colors_fix for the closest)` : ""}`,
		);
		return text(`${head}\n${lines.join("\n")}`, {
			allPass: failed === 0,
			level,
			size,
			required,
			results,
		});
	}),
});
