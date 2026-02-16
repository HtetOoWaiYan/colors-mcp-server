#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import { ContrastInputSchema } from "./schemas/accessibility.js";
import {
	BatchConvertInputSchema,
	ConvertInputSchema,
	ParseInputSchema,
} from "./schemas/conversion.js";
import {
	AdjustInputSchema,
	DifferenceInputSchema,
	MixInputSchema,
	ScaleInputSchema,
} from "./schemas/manipulation.js";
import { handleContrast } from "./tools/accessibility.js";
import {
	handleBatchConvert,
	handleConvert,
	handleParse,
} from "./tools/conversion.js";
import {
	handleAdjust,
	handleDifference,
	handleMix,
	handleScale,
} from "./tools/manipulation.js";

/**
 * Colors MCP Server
 * Modern server for color conversion, manipulation, and analysis.
 */

// Create MCP server instance
const server = new McpServer({
	name: "colors-mcp-server",
	version: "1.0.2",
});

server.tool(
	"colors_convert",
	"Convert a color to a different color space",
	ConvertInputSchema.shape,
	handleConvert,
);

server.tool(
	"colors_batch_convert",
	"Convert multiple colors to a target color space",
	BatchConvertInputSchema.shape,
	handleBatchConvert,
);

server.tool(
	"colors_parse",
	"Parse and validate a color string",
	ParseInputSchema.shape,
	handleParse,
);

server.tool(
	"colors_adjust",
	"Adjust color properties (lightness, chroma, hue)",
	AdjustInputSchema.shape,
	handleAdjust,
);

server.tool(
	"colors_mix",
	"Mix two colors with perceptual interpolation",
	MixInputSchema.shape,
	handleMix,
);

server.tool(
	"colors_scale",
	"Generate a perceptually uniform color scale",
	ScaleInputSchema.shape,
	handleScale,
);

server.tool(
	"colors_difference",
	"Calculate color difference (DeltaE) or contrast ratio",
	DifferenceInputSchema.shape,
	handleDifference,
);

server.tool(
	"colors_contrast",
	"Check WCAG contrast ratio between foreground and background colors (AA, AAA, non-text)",
	ContrastInputSchema.shape,
	handleContrast,
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
