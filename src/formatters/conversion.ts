import { formatRgb, formatHsl, type Color } from "culori";

/**
 * Formats a color object or string for display in Markdown.
 * Uses modern CSS syntax (spaces, no commas).
 */
export function stringifyColor(color: string | Color): string {
  if (typeof color === "string") return color;
  
  const mode = color.mode;
  if (mode === "rgb") return formatRgb(color);
  if (mode === "hsl") return formatHsl(color);
  
  // Explicitly handle common perceptual/wide-gamut spaces for correct property order
  if (mode === "oklch" || mode === "lch") {
    const { l, c, h, alpha } = color as any;
    return `${mode}(${l} ${c} ${h}${alpha !== undefined ? ` / ${alpha}` : ""})`;
  }
  
  if (mode === "oklab" || mode === "lab") {
    const { l, a, b, alpha } = color as any;
    return `${mode}(${l} ${a} ${b}${alpha !== undefined ? ` / ${alpha}` : ""})`;
  }

  if (mode === "p3") {
    const { r, g, b, alpha } = color as any;
    return `color(display-p3 ${r} ${g} ${b}${alpha !== undefined ? ` / ${alpha}` : ""})`;
  }
  
  // Fallback for other modes
  const values = Object.entries(color)
    .filter(([key]) => key !== "mode" && key !== "alpha")
    .map(([_, val]) => val)
    .join(" ");
  
  return `${mode}(${values}${color.alpha !== undefined ? ` / ${color.alpha}` : ""})`;
}

/**
 * Generates a Markdown summary for a color conversion.
 */
export function formatConversionResult(input: string, output: string | Color, to: string): string {
  const outputStr = stringifyColor(output);
  return `Converted **${input}** to **${outputStr}**`;
}
