import { formatRgb, formatHsl, type Color } from "culori";

/**
 * Formats a color object or string for display in Markdown.
 */
export function stringifyColor(color: any): string {
  if (typeof color === "string") return color;
  
  const mode = color.mode;
  if (mode === "rgb") return formatRgb(color);
  if (mode === "hsl") return formatHsl(color);
  
  // For other modes, we'll use a generic functional notation
  // e.g., oklch(0.5 0.1 20)
  const values = Object.entries(color)
    .filter(([key]) => key !== "mode" && key !== "alpha")
    .map(([_, val]) => val)
    .join(" ");
  
  return `${mode}(${values}${color.alpha !== undefined ? ` / ${color.alpha}` : ""})`;
}

/**
 * Generates a Markdown summary for a color conversion.
 */
export function formatConversionResult(input: string, output: any, to: string): string {
  const outputStr = stringifyColor(output);
  return `Converted **${input}** to **${outputStr}**`;
}
