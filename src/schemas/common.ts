import { z } from "zod";
import { parse } from "culori";

/**
 * Zod schema for validating color strings using Culori.
 * Supports HEX, RGB, HSL, OKLCH, Oklab, P3, Lab, LCH, and named colors.
 */
export const ColorSchema = z.string()
  .min(1, "Color string cannot be empty")
  .describe("Color string (HEX, RGB, HSL, OKLCH, etc.)")
  .refine((val) => {
    try {
      return !!parse(val);
    } catch {
      return false;
    }
  }, {
    message: "Invalid color format. Supported: HEX, RGB, HSL, OKLCH, Lab, P3, etc."
  });

/**
 * Zod schema for precision parameter.
 * Limits precision to 0-10 decimal places.
 */
export const PrecisionSchema = z.number()
  .int("Precision must be an integer")
  .min(0, "Precision cannot be negative")
  .max(10, "Precision cannot exceed 10")
  .default(3)
  .describe("Decimal places for output (0-10)");
