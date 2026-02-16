import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { formatContrastResult } from "../formatters/accessibility.js";
import { checkContrast } from "../lib/engine.js";
import type {
	BatchContrastInput,
	ContrastInput,
} from "../schemas/accessibility.js";

export async function handleContrast(
	args: ContrastInput,
): Promise<CallToolResult> {
	const { foreground, background, base } = args;
	const result = checkContrast(foreground, background, base);
	const markdown = formatContrastResult(foreground, background, result);

	return {
		content: [{ type: "text", text: markdown }],
		structuredContent: {
			foreground,
			background,
			ratio: result.ratio,
			aa: result.aa,
			aaa: result.aaa,
			nonText: result.nonText,
		},
	};
}

export async function handleBatchContrast(
	args: BatchContrastInput,
): Promise<CallToolResult> {
	const { checks, foregrounds, backgrounds, base } = args;
	const results: Array<{
		foreground: string;
		background: string;
		ratio: number;
		pass: boolean; // AA Regular
	}> = [];

	let markdown = "### Batch Contrast Check\n\n";

	if (checks) {
		for (const check of checks) {
			const res = checkContrast(check.foreground, check.background, base);
			results.push({
				foreground: check.foreground,
				background: check.background,
				ratio: res.ratio,
				pass: res.aa.regular,
			});
		}
	}

	if (foregrounds && backgrounds) {
		for (const fg of foregrounds) {
			for (const bg of backgrounds) {
				const res = checkContrast(fg, bg, base);
				results.push({
					foreground: fg,
					background: bg,
					ratio: res.ratio,
					pass: res.aa.regular,
				});
			}
		}
	}

	// Create a condensed table for the output
	markdown += "| Foreground | Background | Ratio | AA Pass |\n";
	markdown += "| :--- | :--- | :--- | :---: |\n";
	for (const r of results) {
		const passIcon = r.pass ? "✅" : "❌";
		markdown += `| **${r.foreground}** | **${r.background}** | ${r.ratio} | ${passIcon} |\n`;
	}

	return {
		content: [{ type: "text", text: markdown }],
		structuredContent: {
			results,
			base,
		},
	};
}
