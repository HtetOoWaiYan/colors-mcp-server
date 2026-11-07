import { Ajv } from "ajv";

const ajv = new Ajv({ allErrors: false, strict: false });

export interface Candidate {
	text: string;
	parsed: boolean;
	value?: unknown;
}

export interface Extraction {
	candidates: Candidate[];
	/** Exactly one candidate, parsing as JSON and valid against the schema. */
	strict: { ok: boolean; value?: unknown };
	lenient: { ok: boolean; value?: unknown };
}

function tryParse(text: string): { ok: boolean; value?: unknown } {
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return { ok: false };
	}
}

function balancedSpans(text: string): string[] {
	const spans: string[] = [];
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch !== "{" && ch !== "[") {
			i++;
			continue;
		}
		let depth = 0;
		let inStr = false;
		let esc = false;
		let end = -1;
		for (let j = i; j < text.length; j++) {
			const c = text[j] as string;
			if (inStr) {
				if (esc) esc = false;
				else if (c === "\\") esc = true;
				else if (c === '"') inStr = false;
				continue;
			}
			if (c === '"') inStr = true;
			else if (c === "{" || c === "[") depth++;
			else if (c === "}" || c === "]") {
				depth--;
				if (depth === 0) {
					end = j;
					break;
				}
			}
		}
		if (end === -1) {
			i++;
			continue;
		}
		const span = text.slice(i, end + 1);
		if (tryParse(span).ok) {
			spans.push(span);
			i = end + 1;
		} else {
			i++;
		}
	}
	return spans;
}

export function extractAnswer(
	message: string,
	schema: Record<string, unknown>,
): Extraction {
	const fenced = [...message.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)].map((m) =>
		(m[1] as string).trim(),
	);
	let texts: string[];
	if (fenced.length > 0) texts = fenced;
	else if (tryParse(message.trim()).ok) texts = [message.trim()];
	else texts = balancedSpans(message);

	const candidates: Candidate[] = texts.map((text) => {
		const p = tryParse(text);
		return { text, parsed: p.ok, value: p.value };
	});

	const parsedOnes = candidates.filter((c) => c.parsed);
	const last = parsedOnes[parsedOnes.length - 1];
	const lenient = last ? { ok: true, value: last.value } : { ok: false };

	let strict: { ok: boolean; value?: unknown } = { ok: false };
	if (candidates.length === 1 && candidates[0]?.parsed) {
		const validate = ajv.compile(schema);
		if (validate(candidates[0].value))
			strict = { ok: true, value: candidates[0].value };
	}
	return { candidates, strict, lenient };
}
