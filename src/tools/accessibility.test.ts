import { describe, expect, it } from "vitest";
import { handleContrast } from "./accessibility.js";

describe("handleContrast", () => {
	it("returns markdown content with pass/fail table", async () => {
		const result = await handleContrast({
			foreground: "#000000",
			background: "#ffffff",
		});

		expect(result.content).toHaveLength(1);
		const text = result.content[0];
		if (text.type !== "text") throw new Error("Expected text content");
		expect(text.text).toContain("21:1");
		expect(text.text).toContain("✅ Pass");
		expect(text.text).toContain("AA");
		expect(text.text).toContain("AAA");
	});

	it("returns structured content with all fields", async () => {
		const result = await handleContrast({
			foreground: "#000000",
			background: "#ffffff",
		});

		const sc = result.structuredContent as Record<string, unknown>;
		expect(sc.foreground).toBe("#000000");
		expect(sc.background).toBe("#ffffff");
		expect(sc.ratio).toBe(21);
		expect(sc.aa).toEqual({ regular: true, large: true });
		expect(sc.aaa).toEqual({ regular: true, large: true });
		expect(sc.nonText).toBe(true);
	});

	it("shows fail badges for low contrast", async () => {
		const result = await handleContrast({
			foreground: "#ffffff",
			background: "#ffffff",
		});

		const text = result.content[0];
		if (text.type !== "text") throw new Error("Expected text content");
		expect(text.text).toContain("❌ Fail");
	});
});
