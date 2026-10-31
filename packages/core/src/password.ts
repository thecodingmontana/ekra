/** Password rules (from zadaci-old's strength check, at Ekra's 10-character minimum). Web shows them; the server enforces them. */
export const PASSWORD_RULES = [
	{
		id: "length",
		text: "At least 10 characters",
		test: (p: string) => p.length >= 10,
	},
	{
		id: "number",
		text: "At least 1 number",
		test: (p: string) => /\d/.test(p),
	},
	{
		id: "lower",
		text: "At least 1 lowercase letter",
		test: (p: string) => /[a-z]/.test(p),
	},
	{
		id: "upper",
		text: "At least 1 uppercase letter",
		test: (p: string) => /[A-Z]/.test(p),
	},
] as const;

/** Each rule, and whether this password meets it. */
export function passwordChecks(password: string) {
	return PASSWORD_RULES.map((rule) => ({
		id: rule.id,
		text: rule.text,
		met: rule.test(password),
	}));
}

/** How many rules are met, 0–4. */
export function passwordScore(password: string): number {
	return passwordChecks(password).filter((check) => check.met).length;
}

/** What's still missing, in words, or null when the password meets every rule. */
export function passwordProblem(password: string): string | null {
	const missing = passwordChecks(password).filter((check) => !check.met);
	if (missing.length === 0) return null;
	return `Your password needs: ${missing.map((check) => check.text.toLowerCase()).join(", ")}.`;
}
