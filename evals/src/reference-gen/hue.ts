/** True when hue h (degrees) lies on the arc from min to max going counter-clockwise, so 340..20 wraps through 0. */
export function inHueBand(h: number, min: number, max: number): boolean {
	const norm = (x: number) => ((x % 360) + 360) % 360;
	const span = norm(max - min);
	return norm(h - min) <= span;
}
