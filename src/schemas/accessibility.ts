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

/**
 * Input schema for the colors_batch_contrast tool.
 * Allows checking contrast for:
 * 1. A list of checks (specific foreground/background pairs)
 * 2. Cross-product of foregrounds and backgrounds (all combinations)
 */
export const BatchContrastInputSchema = z
	.object({
		base: ColorSchema.optional().describe(
			'Base color to blend transparent backgrounds over (default: "#ffffff")',
		),
		checks: z
			.array(
				z.object({
					foreground: ColorSchema,
					background: ColorSchema,
				}),
			)
			.optional()
			.describe("List of specific foreground/background pairs to check"),
		foregrounds: z
			.array(ColorSchema)
			.optional()
			.describe(
				"List of foreground colors to check (combined with backgrounds)",
			),
		backgrounds: z
			.array(ColorSchema)
			.optional()
			.describe(
				"List of background colors to check (combined with foregrounds)",
			),
	})
	.strict()
	.refine(
		(data) => {
			const hasChecks = data.checks && data.checks.length > 0;
			const hasCross =
				data.foregrounds &&
				data.foregrounds.length > 0 &&
				data.backgrounds &&
				data.backgrounds.length > 0;
			return hasChecks || hasCross;
		},
		{
			message:
				"Must provide either 'checks' array OR both 'foregrounds' and 'backgrounds' arrays.",
		},
	);

export type BatchContrastInput = z.infer<typeof BatchContrastInputSchema>;
