#!/usr/bin/env node
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import {
	BatchContrastInputSchema,
	ContrastInputSchema,
} from "./schemas/accessibility.js";
import {
	BatchConvertInputSchema,
	ConvertInputSchema,
	ParseInputSchema,
} from "./schemas/conversion.js";
import {
	AdjustInputSchema,
	BatchAdjustInputSchema,
	BatchDifferenceInputSchema,
	DifferenceInputSchema,
	MixInputSchema,
	ScaleInputSchema,
} from "./schemas/manipulation.js";
import { handleBatchContrast, handleContrast } from "./tools/accessibility.js";
import {
	handleBatchConvert,
	handleConvert,
	handleParse,
} from "./tools/conversion.js";
import {
	handleAdjust,
	handleBatchAdjust,
	handleBatchDifference,
	handleDifference,
	handleMix,
	handleScale,
} from "./tools/manipulation.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

/**
 * Colors MCP Server
 * Modern server for color conversion, manipulation, and analysis.
 */

// Create MCP server instance
const server = new McpServer({
	name: "colors-mcp-server",
	version,
});

server.registerTool(
	"colors_convert",
	{
		title: "Convert Color",
		description: "Convert a color to a different color space",
		inputSchema: ConvertInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleConvert,
);

server.registerTool(
	"colors_batch_convert",
	{
		title: "Batch Convert Colors",
		description: "Convert multiple colors to a target color space",
		inputSchema: BatchConvertInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleBatchConvert,
);

server.registerTool(
	"colors_parse",
	{
		title: "Parse Color",
		description: "Parse and validate a color string",
		inputSchema: ParseInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleParse,
);

server.registerTool(
	"colors_adjust",
	{
		title: "Adjust Color",
		description: "Adjust color properties (lightness, chroma, hue)",
		inputSchema: AdjustInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleAdjust,
);

server.registerTool(
	"colors_batch_adjust",
	{
		title: "Batch Adjust Colors",
		description: "Adjust a list of colors (lightness, chroma, hue)",
		inputSchema: BatchAdjustInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleBatchAdjust,
);

server.registerTool(
	"colors_mix",
	{
		title: "Mix Colors",
		description: "Mix two colors with perceptual interpolation",
		inputSchema: MixInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleMix,
);

server.registerTool(
	"colors_scale",
	{
		title: "Generate Color Scale",
		description: "Generate a perceptually uniform color scale",
		inputSchema: ScaleInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleScale,
);

server.registerTool(
	"colors_difference",
	{
		title: "Color Difference",
		description: "Calculate color difference (DeltaE) or contrast ratio",
		inputSchema: DifferenceInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleDifference,
);

server.registerTool(
	"colors_batch_difference",
	{
		title: "Batch Color Difference",
		description:
			"Calculate difference between a reference and list of colors, finding the nearest match.",
		inputSchema: BatchDifferenceInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleBatchDifference,
);

server.registerTool(
	"colors_contrast",
	{
		title: "Check Contrast",
		description:
			"Check WCAG contrast ratio between foreground and background colors (AA, AAA, non-text)",
		inputSchema: ContrastInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleContrast,
);

server.registerTool(
	"colors_batch_contrast",
	{
		title: "Batch Check Contrast",
		description:
			"Check WCAG contrast ratio for multiple color pairs or combinations.",
		inputSchema: BatchContrastInputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	handleBatchContrast,
);

/**
 * Main entry point
 */
async function main() {
	try {
		const transport = new StdioServerTransport();

		// Connect to transport
		await server.connect(transport);

		logger.info("Colors MCP Server running on stdio");
	} catch (error) {
		logger.error(error, "Critical failure in server startup");
		process.exit(1);
	}
}

// Global error handling for unhandled rejections
process.on("unhandledRejection", (reason) => {
	logger.error(reason, "Unhandled Rejection");
});

main().catch((error) => {
	logger.error(error, "Unhandled error in main");
	process.exit(1);
});
