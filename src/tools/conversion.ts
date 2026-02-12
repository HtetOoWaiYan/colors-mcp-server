import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { convertColor, parseColor } from "../lib/engine.js";
import { formatConversionResult, stringifyColor } from "../formatters/conversion.js";
import type { ConvertInput, BatchConvertInput, ParseInput } from "../schemas/conversion.js";

export async function handleConvert(args: ConvertInput): Promise<CallToolResult> {
	const { color, to, precision } = args;
	const result = convertColor(color, to, precision);
	const markdown = formatConversionResult(color, result, to);

	return {
		content: [{ type: "text", text: markdown }],
		structuredContent: {
			input: color,
			output: typeof result === "string" ? result : stringifyColor(result),
			raw: result,
			space: to,
		},
	};
}

export async function handleBatchConvert(args: BatchConvertInput): Promise<CallToolResult> {
	const { colors, to, precision } = args;
	const results = colors.map((color) => {
		const result = convertColor(color, to, precision);
		return {
			input: color,
			output: typeof result === "string" ? result : stringifyColor(result),
			raw: result,
		};
	});

	const markdown = results
		.map((r) => `- **${r.input}** → **${r.output}**`)
		.join("\n");

	return {
		content: [{ type: "text", text: `### Batch Conversion to ${to}\n\n${markdown}` }],
		structuredContent: {
			results,
			space: to,
		},
	};
}

export async function handleParse(args: ParseInput): Promise<CallToolResult> {
	const { color } = args;
	const parsed = parseColor(color);
	const normalized = stringifyColor(parsed);

	return {
		content: [
			{
				type: "text",
				text: `Color **${color}** is valid. Normalized: **${normalized}**`,
			},
		],
		structuredContent: {
			input: color,
			normalized,
			raw: parsed,
			valid: true,
		},
	};
}
