import type { ContrastResult } from "../lib/engine.js";

const PASS = "✅ Pass";
const FAIL = "❌ Fail";

function badge(value: boolean): string {
	return value ? PASS : FAIL;
}

/**
 * Formats a contrast check result as a Markdown table.
 */
export function formatContrastResult(
	fg: string,
	bg: string,
	result: ContrastResult,
): string {
	const lines = [
		`### Contrast: ${fg} vs ${bg} — ${result.ratio}:1`,
		"",
		"| Level | Regular Text | Large Text |",
		"|-------|-------------|------------|",
		`| AA (WCAG 1.4.3) | ${badge(result.aa.regular)} | ${badge(result.aa.large)} |`,
		`| AAA (WCAG 1.4.6) | ${badge(result.aaa.regular)} | ${badge(result.aaa.large)} |`,
		"",
		`**Non-text** (WCAG 1.4.11): ${badge(result.nonText)}`,
	];

	return lines.join("\n");
}
