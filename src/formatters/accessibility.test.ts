import { describe, expect, it } from "vitest";
import type { ContrastResult } from "../lib/engine.js";
import { formatContrastResult } from "./accessibility.js";

describe("formatContrastResult", () => {
	it("formats existing contrast result correctly", () => {
		const result: ContrastResult = {
			ratio: 4.5,
			aa: { regular: true, large: true },
			aaa: { regular: false, large: true },
			nonText: true,
		};

		const formatted = formatContrastResult("#000000", "#ffffff", result);

		expect(formatted).toContain("### Contrast: #000000 vs #ffffff — 4.5:1");
		expect(formatted).toContain("| AA (WCAG 1.4.3) | ✅ Pass | ✅ Pass |");
		expect(formatted).toContain("| AAA (WCAG 1.4.6) | ❌ Fail | ✅ Pass |");
		expect(formatted).toContain("**Non-text** (WCAG 1.4.11): ✅ Pass");
	});

	it("formats failing contrast result correctly", () => {
		const result: ContrastResult = {
			ratio: 1.0,
			aa: { regular: false, large: false },
			aaa: { regular: false, large: false },
			nonText: false,
		};

		const formatted = formatContrastResult("#ffffff", "#ffffff", result);

		expect(formatted).toContain("### Contrast: #ffffff vs #ffffff — 1:1");
		expect(formatted).toContain("| AA (WCAG 1.4.3) | ❌ Fail | ❌ Fail |");
		expect(formatted).toContain("| AAA (WCAG 1.4.6) | ❌ Fail | ❌ Fail |");
		expect(formatted).toContain("**Non-text** (WCAG 1.4.11): ❌ Fail");
	});
});
