import { z } from "zod";
import { ColorSchema } from "./common.js";

/**
 * Input schema for the colors_contrast tool.
 * Checks WCAG contrast ratio between foreground and background colors
 * across AA, AAA, and non-text levels.
 */
export const ContrastInputSchema = z
  .object({
    foreground: ColorSchema.describe(
      'Foreground (text) color (e.g., "#000000", "black", "oklch(0 0 0)")',
    ),
    background: ColorSchema.describe(
      'Background color (e.g., "#ffffff", "white", "oklch(1 0 0)")',
    ),
    base: ColorSchema.optional().describe(
      'Base color to blend transparent backgrounds over (default: "#ffffff")',
    ),
  })
  .strict();

export type ContrastInput = z.infer<typeof ContrastInputSchema>;
