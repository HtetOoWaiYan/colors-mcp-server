import { z } from "zod";
import { MAX_BATCH_SIZE, SUPPORTED_SPACES } from "../constants.js";
import { ColorSchema, PrecisionSchema } from "./common.js";

/**
 * Input schema for the colors_convert tool.
 */
export const ConvertInputSchema = z
	.object({
		color: ColorSchema,
		to: z.enum(SUPPORTED_SPACES).describe("Target color space"),
		precision: PrecisionSchema,
	})
	.strict();

/**
 * Input schema for the colors_batch_convert tool.
 */
export const BatchConvertInputSchema = z
	.object({
		colors: z
			.array(ColorSchema)
			.min(1, "At least one color is required")
			.max(
				MAX_BATCH_SIZE,
				`Cannot convert more than ${MAX_BATCH_SIZE} colors at once`,
			)
			.describe("List of color strings to convert"),
		to: z.enum(SUPPORTED_SPACES).describe("Target color space"),
		precision: PrecisionSchema,
	})
	.strict();

export type ConvertInput = z.infer<typeof ConvertInputSchema>;
export type BatchConvertInput = z.infer<typeof BatchConvertInputSchema>;
