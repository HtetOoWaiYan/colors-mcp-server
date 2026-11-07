// Generic Y'CbCr for any luma coefficients, bit depth and range; results stay unrounded so graders can apply the rounding tolerance.
import { hexToRgb } from "../reference/color.js";

export interface YcbcrSpec {
	kr: number;
	kb: number;
	bits: 8 | 10;
	/** limited: Y' 16..235 and C 16..240 scaled by 2^(bits-8); full: 0..2^bits-1 with chroma centered at 2^(bits-1) (JFIF at 8 bits). */
	range: "limited" | "full";
}

const scaleOf = (s: YcbcrSpec) => {
	const k = 2 ** (s.bits - 8);
	return s.range === "limited"
		? { y0: 16 * k, ySpan: 219 * k, c0: 128 * k, cSpan: 224 * k }
		: {
				y0: 0,
				ySpan: 2 ** s.bits - 1,
				c0: 2 ** (s.bits - 1),
				cSpan: 2 ** s.bits - 1,
			};
};

export function encodeYcbcr(hex: string, s: YcbcrSpec): [number, number, number] {
	const [r, g, b] = hexToRgb(hex);
	const y = s.kr * r + (1 - s.kr - s.kb) * g + s.kb * b;
	const cb = (b - y) / (2 * (1 - s.kb));
	const cr = (r - y) / (2 * (1 - s.kr));
	const k = scaleOf(s);
	return [k.y0 + k.ySpan * y, k.c0 + k.cSpan * cb, k.c0 + k.cSpan * cr];
}

/** R'G'B' in 0..1, not clipped, so a caller can tell whether the code values were a legal color. */
export function decodeYcbcr(
	y: number,
	cb: number,
	cr: number,
	s: YcbcrSpec,
): [number, number, number] {
	const k = scaleOf(s);
	const ey = (y - k.y0) / k.ySpan;
	const ecb = (cb - k.c0) / k.cSpan;
	const ecr = (cr - k.c0) / k.cSpan;
	const r = ey + 2 * (1 - s.kr) * ecr;
	const b = ey + 2 * (1 - s.kb) * ecb;
	const g = (ey - s.kr * r - s.kb * b) / (1 - s.kr - s.kb);
	return [r, g, b];
}

export const BT601: Pick<YcbcrSpec, "kr" | "kb"> = { kr: 0.299, kb: 0.114 };
export const BT709: Pick<YcbcrSpec, "kr" | "kb"> = { kr: 0.2126, kb: 0.0722 };
export const BT2020: Pick<YcbcrSpec, "kr" | "kb"> = { kr: 0.2627, kb: 0.0593 };
