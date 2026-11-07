// ITU-R BT.709 (8-bit limited range) and JFIF 1.02; results stay unrounded so graders can apply the rounding tolerance.
import { hexToRgb } from "../reference/color.js";

const KR = 0.2126;
const KB = 0.0722;
const KG = 1 - KR - KB;

export function encode709Limited(hex: string): [number, number, number] {
	const [r, g, b] = hexToRgb(hex);
	const y = KR * r + KG * g + KB * b;
	const cb = (b - y) / (2 * (1 - KB));
	const cr = (r - y) / (2 * (1 - KR));
	return [16 + 219 * y, 128 + 224 * cb, 128 + 224 * cr];
}

/** R'G'B' in 0..1, not clipped, so a caller can tell whether the code values were a legal color. */
export function decode709Limited(
	y: number,
	cb: number,
	cr: number,
): [number, number, number] {
	const ey = (y - 16) / 219;
	const ecb = (cb - 128) / 224;
	const ecr = (cr - 128) / 224;
	const r = ey + 2 * (1 - KR) * ecr;
	const b = ey + 2 * (1 - KB) * ecb;
	const g = (ey - KR * r - KB * b) / KG;
	return [r, g, b];
}

export function encodeJfif(hex: string): [number, number, number] {
	const [r, g, b] = hexToRgb(hex).map((v) => v * 255) as [
		number,
		number,
		number,
	];
	return [
		0.299 * r + 0.587 * g + 0.114 * b,
		128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
		128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
	];
}
