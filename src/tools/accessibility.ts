import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { formatContrastResult } from "../formatters/accessibility.js";
import { checkContrast } from "../lib/engine.js";
import type { ContrastInput } from "../schemas/accessibility.js";

export async function handleContrast(
	args: ContrastInput,
): Promise<CallToolResult> {
	const { foreground, background } = args;
	const result = checkContrast(foreground, background);
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
