#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { logger } from "./logger.js";
import { createServer } from "./server.js";

// serveStdio serves both 2025-era (initialize) and 2026-07-28 (server/discover) clients on one connection.

process.on("unhandledRejection", (reason) => {
	logger.error(reason, "Unhandled Rejection");
});

try {
	const handle = serveStdio(createServer, {
		onerror: (error) => logger.error(error, "Transport error"),
	});
	const shutdown = () => {
		void handle.close().finally(() => process.exit(0));
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
	logger.info("Colors MCP Server running on stdio");
} catch (error) {
	logger.error(error, "Critical failure in server startup");
	process.exit(1);
}
