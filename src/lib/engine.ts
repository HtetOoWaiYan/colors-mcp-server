import { converter, parse, formatHex, type Color } from "culori";

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
      `You can use the 'colors_parse' tool to validate color strings.`
    );
  }
  return parsed;
}

/**
 * Rounds numeric properties of a color object to the specified precision.
 */
export function roundValues<T extends Record<string, any>>(color: T, precision: number = 3): T {
  const result = { ...color };
  for (const key in result) {
    if (typeof result[key] === "number") {
      result[key] = Number(result[key].toFixed(precision));
    }
  }
  return result;
}

/**
 * Converts a color to the target color space and rounds values.
 * If target is 'hex', returns the hex string.
 */
export function convertColor(color: string, to: string, precision: number = 3): string | Color {
  const parsed = parseColor(color);
  
  if (to.toLowerCase() === "hex") {
    const hex = formatHex(parsed);
    if (!hex) {
      throw new Error(`Could not format "${color}" as hex. Ensure it is a valid color.`);
    }
    return hex;
  }

  const convert = converter(to as any);
  if (!convert) {
    throw new Error(
      `Unsupported color space: "${to}". \n` +
      `Supported spaces include: hex, rgb, hsl, oklch, oklab, p3, lab, lch.`
    );
  }

  const converted = convert(parsed);
  return roundValues(converted, precision);
}
