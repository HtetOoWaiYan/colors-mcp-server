import { describe, it, expect } from "vitest";
import { formatConversionResult } from "./conversion.js";

describe("formatConversionResult", () => {
  it("should format conversion result correctly", () => {
    const result = formatConversionResult("#ff0000", "oklch(0.628 0.258 29.234)", "oklch");
    expect(result).toBe("Converted **#ff0000** to **oklch(0.628 0.258 29.234)**");
  });

  it("should handle hex output", () => {
    const result = formatConversionResult("rgb(255, 0, 0)", "#ff0000", "hex");
    expect(result).toBe("Converted **rgb(255, 0, 0)** to **#ff0000**");
  });
});
