import { type Color, converter, formatHex, type Mode, parse } from "culori";

/**
 * Parses a color string into a Culori color object.
 * Throws an educational error if the format is invalid.
 */
export function parseColor(color: string): Color {
	const parsed = parse(color);
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
