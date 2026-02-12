import { describe, it, expect } from "vitest";
import { parseColor, convertColor, roundValues } from "./engine.js";

describe("engine", () => {
  describe("parseColor", () => {
    it("should parse valid colors", () => {
      const red = parseColor("red");
      expect(red.mode).toBe("rgb");
    });

    it("should throw for invalid colors", () => {
      expect(() => parseColor("not-a-color")).toThrow();
    });
  });

  describe("roundValues", () => {
    it("should round numeric values to specified precision", () => {
      const color = { mode: "rgb", r: 0.123456, g: 0.5, b: 0.987654 };
      const rounded = roundValues(color, 3);
      expect(rounded.r).toBe(0.123);
      expect(rounded.g).toBe(0.5);
      expect(rounded.b).toBe(0.988);
    });
  });

  describe("convertColor", () => {
    it("should convert between spaces and round", () => {
      const result = convertColor("#ff0000", "oklch", 3);
      expect(result.mode).toBe("oklch");
      expect(result.l).toBe(0.628);
      expect(result.c).toBe(0.258);
      expect(result.h).toBe(29.234);
    });

    it("should handle hex output", () => {
      const result = convertColor("rgb(255, 0, 0)", "hex");
      expect(result).toBe("#ff0000");
    });
  });
});
