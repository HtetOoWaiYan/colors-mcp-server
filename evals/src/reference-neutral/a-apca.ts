/**
 * Author A reference: APCA-W3 contrast, version 0.0.98G-4g ("SAPC 0.98G" constants), written by hand
 * from the published algorithm (Myndex / W3C Silver "APCA-W3" description, 0.0.98G-4g constants).
 *
 * Screen luminance Ys uses a plain 2.4 exponent (no linear toe) and the sRGB/BT.709 Y coefficients
 * 0.2126729 / 0.7151522 / 0.0721750. Then soft black clamp, power curves per polarity, scaling,
 * low-contrast clip and offset. Lc is signed: positive for dark text on a light background
 * ("BoW"), negative for light text on a dark background ("WoB").
 */
import { hexToRgb, type Rgb } from "../reference/color.js";

const MAIN_TRC = 2.4;
const S_RCO = 0.2126729;
const S_GCO = 0.7151522;
const S_BCO = 0.072175;

const NORM_BG = 0.56;
const NORM_TXT = 0.57;
const REV_TXT = 0.62;
const REV_BG = 0.65;

const BLK_THRS = 0.022;
const BLK_CLMP = 1.414;
const SCALE_BOW = 1.14;
const SCALE_WOB = 1.14;
const LO_BOW_OFFSET = 0.027;
const LO_WOB_OFFSET = 0.027;
const DELTA_Y_MIN = 0.0005;
const LO_CLIP = 0.1;

/** APCA screen luminance of an sRGB color (channels 0..1). */
export function apcaY(rgb: Rgb): number {
	return S_RCO * rgb[0] ** MAIN_TRC + S_GCO * rgb[1] ** MAIN_TRC + S_BCO * rgb[2] ** MAIN_TRC;
}

/** Signed Lc (unrounded) for text luminance on background luminance. */
export function apcaFromY(textY: number, bgY: number): number {
	if (Number.isNaN(textY) || Number.isNaN(bgY)) return 0;
	if (Math.min(textY, bgY) < 0 || Math.max(textY, bgY) > 1.1) return 0;
	const clamp = (y: number) => (y > BLK_THRS ? y : y + (BLK_THRS - y) ** BLK_CLMP);
	const t = clamp(textY);
	const b = clamp(bgY);
	if (Math.abs(b - t) < DELTA_Y_MIN) return 0;
	let out: number;
	if (b > t) {
		const sapc = (b ** NORM_BG - t ** NORM_TXT) * SCALE_BOW;
		out = sapc < LO_CLIP ? 0 : sapc - LO_BOW_OFFSET;
	} else {
		const sapc = (b ** REV_BG - t ** REV_TXT) * SCALE_WOB;
		out = sapc > -LO_CLIP ? 0 : sapc + LO_WOB_OFFSET;
	}
	return out * 100;
}

/** Signed Lc of text color on background color (hex), unrounded. */
export const apcaLc = (textHex: string, bgHex: string): number =>
	apcaFromY(apcaY(hexToRgb(textHex)), apcaY(hexToRgb(bgHex)));

/** Signed Lc rounded to 0.1, as reported in the tasks. */
export const apcaLc1 = (textHex: string, bgHex: string): number =>
	Math.round(apcaLc(textHex, bgHex) * 10) / 10;
