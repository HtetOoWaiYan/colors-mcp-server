import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { formatHex } from "culori";
import { stringifyColor } from "../formatters/conversion.js";
import {
	adjustColor,
	calculateDifference,
	createScale,
	mixColors,
} from "../lib/engine.js";
import type {
	AdjustInput,
	DifferenceInput,
	MixInput,
	ScaleInput,
} from "../schemas/manipulation.js";

export async function handleAdjust(args: AdjustInput): Promise<CallToolResult> {
	const result = adjustColor(args.color, args.mode, args.amount, args.relative);
	const output = stringifyColor(result);

	return {
		content: [
			{
				type: "text",
				text: `Adjusted **${args.color}** (${args.mode} ${args.amount}) -> **${output}**`,
			},
		],
		structuredContent: {
			input: args.color,
			operation: "adjust",
			params: { mode: args.mode, amount: args.amount, relative: args.relative },
			output: output,
			raw: result,
		},
	};
}

export async function handleMix(args: MixInput): Promise<CallToolResult> {
	const result = mixColors(args.color1, args.color2, args.ratio, args.mode);
	const output = stringifyColor(result);

	return {
		content: [
			{
				type: "text",
				text: `Mixed **${args.color1}** + **${args.color2}** (${args.ratio}) -> **${output}**`,
			},
		],
		structuredContent: {
			input: [args.color1, args.color2],
			operation: "mix",
			params: { ratio: args.ratio, mode: args.mode },
			output: output,
			raw: result,
		},
	};
}

export async function handleScale(args: ScaleInput): Promise<CallToolResult> {
	const scale = createScale(args.colors, args.steps, args.mode);
	const output = scale.map((c) => formatHex(c));

	return {
		content: [
			{
				type: "text",
				text: `Generated Scale:\n${output.join("\n")}`,
			},
		],
		structuredContent: {
			input: args.colors,
			operation: "scale",
			params: { steps: args.steps, mode: args.mode },
			output: output,
			raw: scale,
		},
	};
}

export async function handleDifference(
	args: DifferenceInput,
): Promise<CallToolResult> {
	const value = calculateDifference(args.color1, args.color2, args.metric);

	return {
		content: [
			{
				type: "text",
				text: `Difference (${args.metric}): **${value.toFixed(4)}**`,
			},
		],
		structuredContent: {
			input: [args.color1, args.color2],
			operation: "difference",
			params: { metric: args.metric },
			value: value,
		},
	};
}
