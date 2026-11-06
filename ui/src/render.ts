/** Renders structuredContent from the colors_* tools. The shape decides the view. */
export type Json = Record<string, unknown>;
function h(
	tag: string,
	attrs: Record<string, string> = {},
	...kids: (Node | string | null)[]
): HTMLElement {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "style") el.setAttribute("style", v);
		else el.setAttribute(k, v);
	}
	for (const k of kids) if (k !== null) el.append(k);
	return el;
}
const swatch = (color: string, label?: string) =>
	h(
		"div",
		{ class: "sw", style: `background:${color}`, title: color },
		label ?? null,
	);
const mono = (t: string) => h("code", {}, t);
const title = (t: string) => h("h1", {}, t);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => String(v ?? "");

function strip(colors: string[], names?: string[], mark?: number): HTMLElement {
	const el = h("div", { class: "strip" });
	colors.forEach((c, i) => {
		const d = h(
			"div",
			{ style: `background:${c};color:${lum(c) > 0.4 ? "#000" : "#fff"}` },
			`${names?.[i] ?? ""}${mark === i ? " ★" : ""}`,
		);
		d.title = c;
		el.append(d);
	});
	return el;
}

function lum(hex: string): number {
	const m = /^#?([0-9a-f]{6})/i.exec(hex);
	if (!m) return 0.5;
	const n = Number.parseInt(m[1] as string, 16);
	const f = (v: number) => {
		const s = v / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return (
		0.2126 * f((n >> 16) & 255) +
		0.7152 * f((n >> 8) & 255) +
		0.0722 * f(n & 255)
	);
}

function renderCheck(sc: Json): HTMLElement {
	const box = h(
		"div",
		{},
		title(
			`Contrast: ${sc.allPass ? "all pass" : "some fail"} (WCAG ${str(sc.level)}, ${str(sc.size)}, needs ${str(sc.required)}:1)`,
		),
	);
	for (const r of asArr(sc.results) as Json[]) {
		const card = h("div", { class: "card" });
		card.append(
			h(
				"div",
				{ class: "row" },
				h(
					"span",
					{ class: `badge ${r.pass ? "ok" : "bad"}` },
					r.pass ? "PASS" : "FAIL",
				),
				mono(`${str(r.ratio)}:1`),
				h("span", { class: "muted" }, `APCA Lc ${str(r.apca)}`),
			),
			h(
				"div",
				{
					class: "sample",
					style: `color:${str(r.foreground)};background:${str(r.background)}`,
				},
				"The quick brown fox jumps over the lazy dog",
			),
			h(
				"div",
				{ class: "row muted" },
				mono(str(r.foreground)),
				"on",
				mono(str(r.background)),
			),
		);
		if (r.suggestion) {
			card.append(
				h(
					"div",
					{ class: "row" },
					"Passing text color:",
					swatch(str(r.suggestion)),
					mono(str(r.suggestion)),
				),
			);
		}
		box.append(card);
	}
	return box;
}

function renderPalette(sc: Json): HTMLElement {
	const kind = str(sc.kind);
	const box = h("div", {}, title(`Palette: ${kind}`));
	if (kind === "theme") {
		const theme = sc.theme as Record<string, Record<string, string>>;
		for (const mode of ["light", "dark"]) {
			const t = theme[mode] ?? {};
			const card = h("div", {
				class: "card",
				style: `background:${t.background};color:${t.text};border-color:${t.border}`,
			});
			card.append(h("div", { class: "row" }, h("strong", {}, `${mode} theme`)));
			const grid = h("div", { class: "grid" });
			for (const [name, color] of Object.entries(t))
				grid.append(
					h(
						"div",
						{ class: "tok" },
						swatch(color),
						h("span", {}, `${name} `, mono(color)),
					),
				);
			card.append(
				grid,
				h(
					"div",
					{ class: "row" },
					h(
						"span",
						{
							class: "badge",
							style: `background:${t.primary};color:${t["on-primary"]};border-color:${t.primary}`,
						},
						"Primary button",
					),
					h("span", { style: `color:${t["text-muted"]}` }, "Muted text sample"),
				),
			);
			box.append(card);
		}
		box.append(
			h(
				"p",
				{ class: "muted" },
				`${str(sc.contrastRulesPassed)}/${str(sc.contrastRulesTotal)} contrast rules pass.`,
			),
		);
		return box;
	}
	const colors = asArr(sc.colors).map(str);
	box.append(
		strip(
			colors,
			asArr(sc.names).map(str),
			typeof sc.seedIndex === "number" ? sc.seedIndex : undefined,
		),
	);
	box.append(h("p", { class: "muted" }, colors.join("  ")));
	return box;
}

function renderBlend(sc: Json): HTMLElement {
	const colors = asArr(sc.colors).map(str);
	const box = h("div", {}, title(`Gradient (${str(sc.space)})`));
	if (colors.length > 1)
		box.append(
			h("div", {
				class: "sample",
				style: `background:linear-gradient(90deg,${colors.join(",")});height:56px`,
			}),
		);
	box.append(strip(colors), h("p", { class: "muted" }, colors.join("  ")));
	return box;
}

function renderCompare(sc: Json): HTMLElement {
	const box = h("div", {}, title(`Closest: ${str(sc.nearest)}`));
	for (const r of asArr(sc.ranking) as Json[])
		box.append(
			h(
				"div",
				{ class: "row" },
				swatch(str(r.color)),
				mono(str(r.color)),
				h("span", {}, `${str(r.distance)} ${str(r.reading)}`),
			),
		);
	return box;
}

function renderVision(sc: Json): HTMLElement {
	const box = h("div", {}, title("Color vision simulation"));
	const sims = (sc.simulations ?? {}) as Record<string, string[]>;
	for (const [type, colors] of Object.entries(sims))
		box.append(
			h(
				"div",
				{ class: "card" },
				h("div", { class: "muted" }, type),
				strip(colors),
			),
		);
	const sep = sc.separation as Record<string, number> | undefined;
	if (sep)
		box.append(
			h(
				"p",
				{ class: "muted" },
				`Weakest pair (ΔE00): ${Object.entries(sep)
					.map(([k, v]) => `${k} ${v}`)
					.join(", ")}`,
			),
		);
	return box;
}

function renderHarmony(sc: Json): HTMLElement {
	const cols = asArr(sc.colors) as Json[];
	const box = h("div", {}, title(`${str(sc.scheme)} scheme`));
	box.append(
		strip(
			cols.map((c) => str(c.color)),
			cols.map(
				(c) => `${Number(c.hueOffset) > 0 ? "+" : ""}${str(c.hueOffset)}°`,
			),
		),
	);
	return box;
}

function renderPairs(sc: Json): HTMLElement {
	const box = h("div", {}, title("Result"));
	for (const r of asArr(sc.results) as Json[]) {
		const out = str(r.output ?? r.hex);
		box.append(
			h(
				"div",
				{ class: "row" },
				swatch(out.startsWith("#") ? out : "transparent"),
				mono(str(r.input)),
				"→",
				mono(out),
			),
		);
	}
	return box;
}

function renderAudit(sc: Json): HTMLElement {
	const box = h(
		"div",
		{},
		title(`${str(sc.problems)} problem(s) in ${str(sc.checked)} checked pairs`),
	);
	for (const f of asArr(sc.findings) as Json[])
		box.append(
			h(
				"div",
				{ class: "card" },
				h("strong", {}, `${str(f.rule)} `),
				mono(str(f.selector)),
				h("div", { class: "muted" }, str(f.message)),
				f.suggestion ? h("div", {}, `Fix: ${str(f.suggestion)}`) : null,
			),
		);
	return box;
}

export function render(sc: Json): HTMLElement {
	const first = Array.isArray(sc.results)
		? (sc.results[0] as Json | undefined)
		: undefined;
	if (first && "ratio" in first) return renderCheck(sc);
	if ("kind" in sc && ("colors" in sc || "theme" in sc))
		return renderPalette(sc);
	if ("findings" in sc) return renderAudit(sc);
	if ("ranking" in sc) return renderCompare(sc);
	if ("simulations" in sc) return renderVision(sc);
	if ("scheme" in sc) return renderHarmony(sc);
	if ("colors" in sc && "space" in sc) return renderBlend(sc);
	if (Array.isArray(sc.results)) return renderPairs(sc);
	return h("pre", {}, JSON.stringify(sc, null, 2));
}
