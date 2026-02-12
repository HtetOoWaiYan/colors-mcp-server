import { describe, expect, it } from "vitest";
import {
	handleBatchConvert,
	handleConvert,
	handleParse,
} from "./conversion.js";

describe("Conversion Tools", () => {
	describe("handleConvert", () => {
		it("should convert hex to rgb", async () => {
			const result = await handleConvert({ color: "#ff0000", to: "rgb" });
			expect(result.content[0].text).toContain("rgb(255, 0, 0)");
			// @ts-expect-error - structuredContent is unknown in CallToolResult
			expect(result.structuredContent.output).toBe("rgb(255, 0, 0)");
		});
	});

	describe("handleBatchConvert", () => {
		it("should convert multiple colors", async () => {
			const result = await handleBatchConvert({
				colors: ["#ff0000", "#00ff00"],
				to: "hsl",
			});
			// @ts-expect-error - structuredContent is unknown in CallToolResult
			expect(result.structuredContent.results).toHaveLength(2);
			expect(result.content[0].text).toContain("#ff0000");
			expect(result.content[0].text).toContain("#00ff00");
		});
	});

	describe("handleParse", () => {
		it("should parse valid color", async () => {
			const result = await handleParse({ color: "blue" });
			// @ts-expect-error - structuredContent is unknown in CallToolResult
			expect(result.structuredContent.valid).toBe(true);
			// @ts-expect-error - structuredContent is unknown in CallToolResult
			expect(result.structuredContent.normalized).toBe("rgb(0, 0, 255)");
		});

		it("should throw on invalid color", async () => {
			await expect(handleParse({ color: "invalid-color" })).rejects.toThrow();
		});
	});
});
