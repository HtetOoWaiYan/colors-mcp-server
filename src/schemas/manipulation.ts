import { z } from "zod";
import { MAX_SCALE_STEPS, SUPPORTED_SPACES } from "../constants.js";
import { ColorSchema } from "./common.js";

/**
 * Input schema for the colors_adjust tool.
 */
export const AdjustInputSchema = z
	.object({
		color: ColorSchema,
		mode: z
			.enum(["lightness", "chroma", "hue"])
			.describe("Property to adjust (lightness, chroma, hue)"),
		amount: z
			.number()
			.describe("Amount to adjust by (e.g., 0.1 for +10%, -0.05 for -5%)"),
		relative: z
			.boolean()
			.optional()
			.default(false)
			.describe("Whether to adjust relatively (%) or absolutely"),
	})
	.strict();

export type AdjustInput = z.infer<typeof AdjustInputSchema>;

/**
 * Input schema for the colors_mix tool.
 */
export const MixInputSchema = z
	.object({
		color1: ColorSchema,
		color2: ColorSchema,
		ratio: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.default(0.5)
			.describe("Mix ratio (0.0 - 1.0, default 0.5)"),
		mode: z
			.enum(SUPPORTED_SPACES)
			.optional()
			.default("oklch")
			.describe("Interpolation color space (default: oklch)"),
	})
	.strict();

export type MixInput = z.infer<typeof MixInputSchema>;

/**
 * Input schema for the colors_scale tool.
 */
export const ScaleInputSchema = z
	.object({
		colors: z
			.array(ColorSchema)
			.min(2, "At least two colors are required")
			.describe("List of colors to generate scale from"),
		steps: z
			.number()
			.int()
			.min(2)
			.max(MAX_SCALE_STEPS)
			.optional()
			.default(5)
			.describe(`Number of steps to generate (max ${MAX_SCALE_STEPS})`),
		mode: z
			.enum(SUPPORTED_SPACES)
			.optional()
			.default("oklch")
			.describe("Interpolation color space (default: oklch)"),
	})
	.strict();

export type ScaleInput = z.infer<typeof ScaleInputSchema>;

/**
 * Input schema for the colors_difference tool.
 */
export const DifferenceInputSchema = z
	.object({
		color1: ColorSchema,
		color2: ColorSchema,
		metric: z
			.enum(["deltaE", "contrast"])
			.optional()
			.default("deltaE")
			.describe("Metric to calculate (deltaE or contrast)"),
	})
	.strict();

export type DifferenceInput = z.infer<typeof DifferenceInputSchema>;
