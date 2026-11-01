export type DiffPart = { op: "same" | "add" | "del"; text: string };

/** Above this many words on either side, the diff only says the whole text changed (it takes words × words). */
const MAX_WORDS = 3000;

/**
 * What changed between two texts, word by word (spaces and line breaks kept), for a version history's "what
 * changed" view. Neighbouring parts of the same kind are merged.
 */
export function diffWords(before: string, after: string): DiffPart[] {
	const a = before.split(/(\s+)/).filter(Boolean);
	const b = after.split(/(\s+)/).filter(Boolean);
	if (a.length > MAX_WORDS || b.length > MAX_WORDS)
		return merge([
			{ op: "del", text: before },
			{ op: "add", text: after },
		]);
	// longest common subsequence, from the end, so the walk below goes forwards
	const w = b.length + 1;
	const lcs = new Uint32Array((a.length + 1) * w);
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			lcs[i * w + j] =
				a[i] === b[j]
					? (lcs[(i + 1) * w + j + 1] ?? 0) + 1
					: Math.max(lcs[(i + 1) * w + j] ?? 0, lcs[i * w + j + 1] ?? 0);
	const parts: DiffPart[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			parts.push({ op: "same", text: a[i] ?? "" });
			i++;
			j++;
		} else if ((lcs[(i + 1) * w + j] ?? 0) >= (lcs[i * w + j + 1] ?? 0))
			parts.push({ op: "del", text: a[i++] ?? "" });
		else parts.push({ op: "add", text: b[j++] ?? "" });
	}
	while (i < a.length) parts.push({ op: "del", text: a[i++] ?? "" });
	while (j < b.length) parts.push({ op: "add", text: b[j++] ?? "" });
	return merge(parts);
}

function merge(parts: DiffPart[]): DiffPart[] {
	const out: DiffPart[] = [];
	for (const p of parts) {
		if (!p.text) continue;
		const last = out.at(-1);
		if (last?.op === p.op) last.text += p.text;
		else out.push({ ...p });
	}
	return out;
}
