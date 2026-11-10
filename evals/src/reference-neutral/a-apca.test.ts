import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../tasks/build/common.js";
import { apcaLc, apcaLc1 } from "./a-apca.js";

const randHex = (rnd: () => number) =>
	`#${Math.floor(rnd() * 0xffffff)
		.toString(16)
		.padStart(6, "0")}`;

describe("APCA-W3 0.0.98G-4g reference", () => {
	// Published example values from the APCA-W3 reference documentation (README of the 0.0.98G-4g
	// reference code, "sample" section): text color first, background second.
	const VECTORS: [string, string, number][] = [
		["#888888", "#ffffff", 63.056469930209424],
		["#ffffff", "#888888", -68.54146436644962],
		["#000000", "#aaaaaa", 58.146262578561334],
		["#aaaaaa", "#000000", -56.24113336839742],
		["#112233", "#ddeeff", 91.66830811481631],
		["#ddeeff", "#112233", -93.06770049484275],
		["#000000", "#ffffff", 106.04067321268862],
		["#ffffff", "#000000", -107.88473318309848],
	];
	it.each(VECTORS)("%s on %s = %f", (txt, bg, lc) => {
		expect(apcaLc(txt, bg)).toBeCloseTo(lc, 6);
	});

	it("is zero for identical colors and rounds to 0.1", () => {
		expect(apcaLc("#777777", "#777777")).toBe(0);
		expect(apcaLc1("#888888", "#ffffff")).toBe(63.1);
	});

	it("agrees with the colorjs.io APCA contrast on random pairs", () => {
		const rnd = mulberry32(301);
		let maxDev = 0;
		for (let i = 0; i < 2000; i++) {
			const txt = randHex(rnd);
			const bg = randHex(rnd);
			// colorjs.io: background.contrast(foreground, "APCA")
			const theirs = new Color(bg).contrast(new Color(txt), "APCA");
			maxDev = Math.max(maxDev, Math.abs(theirs - apcaLc(txt, bg)));
		}
		console.log(`APCA max |dev| vs colorjs.io over 2000 pairs: ${maxDev}`);
		expect(maxDev).toBeLessThan(0.05);
	});
});
