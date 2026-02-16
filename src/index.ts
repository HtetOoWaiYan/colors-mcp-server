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
  name: 'colors-mcp-server',
  version: '1.0.4',
});

server.registerTool(
  'colors_convert',
  {
    title: 'Convert Color',
    description: 'Convert a color to a different color space',
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
  'colors_batch_convert',
  {
    title: 'Batch Convert Colors',
    description: 'Convert multiple colors to a target color space',
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
  'colors_parse',
  {
    title: 'Parse Color',
    description: 'Parse and validate a color string',
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
  'colors_adjust',
  {
    title: 'Adjust Color',
    description: 'Adjust color properties (lightness, chroma, hue)',
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
  'colors_mix',
  {
    title: 'Mix Colors',
    description: 'Mix two colors with perceptual interpolation',
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
  'colors_scale',
  {
    title: 'Generate Color Scale',
    description: 'Generate a perceptually uniform color scale',
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
  'colors_difference',
  {
    title: 'Color Difference',
    description: 'Calculate color difference (DeltaE) or contrast ratio',
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
  'colors_contrast',
  {
    title: 'Check Contrast',
    description:
      'Check WCAG contrast ratio between foreground and background colors (AA, AAA, non-text)',
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
