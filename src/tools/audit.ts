import { z } from "zod";
import { auditCss } from "../engine/audit.js";
import { defineTool } from "./define.js";
import { guarded, text } from "./shared.js";

const input = z.object({
	css: z
		.string()
		.min(1)
		.max(60_000)
		.describe(
			"The CSS text to audit (rules and :root custom properties). Not a file path.",
		),
});

const output = z.object({
	problems: z.number(),
	checked: z.number(),
	findings: z.array(
		z.object({
			rule: z.string(),
			selector: z.string(),
			detail: z.string().optional(),
			message: z.string(),
			suggestion: z.string().optional(),
		}),
	),
});

export const auditTool = defineTool({
	name: "colors_audit",
	title: "Audit CSS colors",
	description:
		'Scan CSS for color problems and return exact findings: "text-contrast-aa" (color on background below 4.5:1), "nontext-contrast-3" (border-color on background below 3:1) and "near-duplicate-token" (two :root custom-property colors almost identical, ΔE00 under 2). Resolves var(--x) from :root. Use for any stylesheet or design review.',
	inputSchema: input,
	outputSchema: output,
	handler: guarded((args) => {
		const { findings, checked } = auditCss(args.css);
		if (findings.length === 0) {
			return text(`No color problems found (${checked} color pairs checked).`, {
				problems: 0,
				checked,
				findings: [],
			});
		}
		const lines = findings.map(
			(f, i) =>
				`${i + 1}. ${f.rule} ${f.selector}${f.detail ? ` [${f.detail}]` : ""}: ${f.message}${f.suggestion ? `. Fix: ${f.suggestion}` : ""}`,
		);
		return text(
			`${findings.length} color problem${findings.length === 1 ? "" : "s"} found (${checked} color pairs checked).\n${lines.join("\n")}`,
			{
				problems: findings.length,
				checked,
				findings,
			},
		);
	}),
});
