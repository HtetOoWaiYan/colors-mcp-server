import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";

/**
 * Colors MCP Server
 * Modern server for color conversion, manipulation, and analysis.
 */

// Create MCP server instance
const server = new McpServer({
	name: "colors-mcp-server",
	version: "1.0.0",
});

// Note: Tools will be registered here in subsequent phases using server.registerTool()

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
