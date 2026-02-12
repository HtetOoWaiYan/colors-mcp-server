import { converter, clampChroma, type Color } from "culori";

const toRgb = converter("rgb");

/**
 * Ensures a color is within the displayable gamut by clamping its chroma.
 * This preserves lightness and hue while reducing saturation if needed.
 */
export function clampToGamut<T extends Color>(color: T): T {
  return clampChroma(color) as T;
}

/**
 * Checks if a color is within the sRGB gamut by verifying RGB components are in [0, 1].
 */
export function isInGamut(color: Color): boolean {
  const rgb = toRgb(color);
  if (!rgb) return false;
  
  const eps = 0.001; // Small epsilon for floating point math
  return (
    rgb.r >= -eps && rgb.r <= 1 + eps &&
    rgb.g >= -eps && rgb.g <= 1 + eps &&
    rgb.b >= -eps && rgb.b <= 1 + eps
  );
}
