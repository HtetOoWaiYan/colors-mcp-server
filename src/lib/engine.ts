import {
  type Color,
  type Oklch,
  converter,
  differenceEuclidean,
  formatHex,
  interpolate,
  type Mode,
  parse,
  samples,
  wcagContrast,
} from 'culori';

/**
 * Parses a color string into a Culori color object.
 * Throws an educational error if the format is invalid.
 */
export function parseColor(color: string): Color {
	const normalized = color.trim().toLowerCase();
	const parsed = parse(normalized);
	if (!parsed) {
		throw new Error(
			`Invalid color format: "${color}". \n` +
				`Please provide a valid color string (e.g., "#ff0000", "red", "rgb(255,0,0)", or "oklch(0.6 0.2 29)"). ` +
				`You can use the 'colors_parse' tool to validate color strings.`,
		);
	}
	return parsed;
}

/**
 * Rounds numeric properties of a color object to the specified precision.
 */
export function roundValues<T extends Color>(color: T, precision = 3): T {
	const result = { ...color };
	for (const key of Object.keys(result) as Array<keyof T>) {
		const value = result[key];
		if (typeof value === "number") {
			result[key] = Number(value.toFixed(precision)) as T[keyof T];
		}
	}
	return result;
}

/**
 * Converts a color to the target color space and rounds values.
 * If target is 'hex', returns the hex string.
 */
export function convertColor(
	color: string,
	to: string,
	precision = 3,
): string | Color {
	const parsed = parseColor(color);

	if (to.toLowerCase() === "hex") {
		const hex = formatHex(parsed);
		if (!hex) {
			throw new Error(
				`Could not format "${color}" as hex. Ensure it is a valid color.`,
			);
		}
		return hex;
	}

	// Validate the mode before passing to converter
	const convert = converter(to as Mode);
	if (!convert) {
		throw new Error(
			`Unsupported color space: "${to}". \n` +
				`Supported spaces include: hex, rgb, hsl, oklch, oklab, p3, lab, lch.`,
		);
	}

	const converted = convert(parsed);
	return roundValues(converted, precision);
}

/**
 * Adjusts properties of a color in OKLCH space.
 */
export function adjustColor(
	color: string,
	mode: "lightness" | "chroma" | "hue",
	amount: number,
	relative = false,
): Color {
	const parsed = parseColor(color);
	const lch = converter("oklch")(parsed) as Oklch;

	switch (mode) {
		case "lightness":
			lch.l = relative ? (lch.l ?? 0) * (1 + amount) : (lch.l ?? 0) + amount;
			break;
		case "chroma":
			lch.c = relative ? (lch.c ?? 0) * (1 + amount) : (lch.c ?? 0) + amount;
			break;
		case "hue":
			lch.h = relative ? (lch.h ?? 0) * (1 + amount) : (lch.h ?? 0) + amount;
			break;
	}

	return lch;
}

/**
 * Mixes two colors using the specified interpolation mode.
 */
export function mixColors(
	color1: string,
	color2: string,
	ratio = 0.5,
	mode: string = "oklch",
): Color {
	const c1 = parseColor(color1);
	const c2 = parseColor(color2);
	const mixer = interpolate([c1, c2], mode as Mode);
	return mixer(ratio);
}

/**
 * Generates a color scale between multiple colors.
 */
export function createScale(
	colors: string[],
	steps: number,
	mode: string = "oklch",
): Color[] {
	const parsedColors = colors.map(parseColor);
	const scale = interpolate(parsedColors, mode as Mode);
	const samplesList = samples(steps);
	// samples(n) returns n numbers roughly equally spaced from 0 to 1
	return samplesList.map((t) => scale(t));
}

/**
 * Calculates the difference between two colors.
 */
export function calculateDifference(
	color1: string,
	color2: string,
	metric: "deltaE" | "contrast" = "deltaE",
): number {
	const c1 = parseColor(color1);
	const c2 = parseColor(color2);

	if (metric === "contrast") {
		return wcagContrast(c1, c2);
	}

	// Use Euclidean difference in Oklab as a good default for DeltaE
	// if 'deltaEOK' logic is desired.
	const diff = differenceEuclidean("oklab");
	return diff(c1, c2);
}

/**
 * Result of a WCAG contrast check.
 */
export interface ContrastResult {
	ratio: number;
	aa: { regular: boolean; large: boolean };
	aaa: { regular: boolean; large: boolean };
	nonText: boolean;
}

// WCAG 2.x contrast thresholds
const CONTRAST_THRESHOLDS = {
	AA_REGULAR: 4.5,
	AA_LARGE: 3,
	AAA_REGULAR: 7,
	AAA_LARGE: 4.5,
	NON_TEXT: 3,
} as const;

/**
 * Checks WCAG contrast ratio between foreground and background colors.
 * Returns the ratio and pass/fail for AA, AAA, and non-text levels.
 */
export function checkContrast(fg: string, bg: string): ContrastResult {
	const fgColor = parseColor(fg);
	const bgColor = parseColor(bg);
	const ratio = wcagContrast(fgColor, bgColor);

	return {
		ratio: Number(ratio.toFixed(2)),
		aa: {
			regular: ratio >= CONTRAST_THRESHOLDS.AA_REGULAR,
			large: ratio >= CONTRAST_THRESHOLDS.AA_LARGE,
		},
		aaa: {
			regular: ratio >= CONTRAST_THRESHOLDS.AAA_REGULAR,
			large: ratio >= CONTRAST_THRESHOLDS.AAA_LARGE,
		},
		nonText: ratio >= CONTRAST_THRESHOLDS.NON_TEXT,
	};
}
