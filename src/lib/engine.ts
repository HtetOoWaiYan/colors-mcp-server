import { converter, parse, formatHex, clampChroma, type Color } from "culori";

/**
 * Parses a color string into a Culori color object.
 * Throws an error if the format is invalid.
 */
export function parseColor(color: string): Color {
  const parsed = parse(color);
  if (!parsed) {
    throw new Error(`Invalid color format: "${color}"`);
  }
  return parsed;
}

/**
 * Rounds numeric properties of a color object to the specified precision.
 */
export function roundValues(color: any, precision: number = 3): any {
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
export function convertColor(color: string, to: string, precision: number = 3): any {
  const parsed = parseColor(color);
  
  if (to.toLowerCase() === "hex") {
    return formatHex(parsed);
  }

  const convert = converter(to);
  if (!convert) {
    throw new Error(`Unsupported color space: "${to}"`);
  }

  const converted = convert(parsed);
  return roundValues(converted, precision);
}
