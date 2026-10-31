/**
 * A "go here after signing in" value, kept only when it stays on this site: a path like "/courses?tab=mine".
 * Browsers read "\" as "/" and drop tabs and newlines, so "/\evil.com" or "/\t/evil.com" would leave the site.
 */
export function safeNextPath(value: unknown): string | undefined {
	if (typeof value !== "string" || !/^\/(?![/\\])/.test(value))
		return undefined;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what's being refused
	if (/[\\\u0000-\u001f\u007f]/.test(value)) return undefined;
	return value;
}
