/** An organization's URL name: also its subdomain (acme → acme.<your domain>), so it follows hostname rules. */

export const SLUG_MIN = 3;
export const SLUG_MAX = 48;

// lowercase letters, digits and inner hyphens; starts and ends with a letter or digit
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Names Ekra keeps for itself, as subdomains or paths. */
const RESERVED = new Set([
	"admin",
	"api",
	"app",
	"assets",
	"auth",
	"blog",
	"cdn",
	"docs",
	"ekra",
	"help",
	"mail",
	"static",
	"status",
	"support",
	"www",
]);

/** A suggested slug from an organization's name: "Acme Learning Co." → "acme-learning-co". */
export function slugify(name: string): string {
	return name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // drop accents: "Café" → "Cafe"
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, SLUG_MAX)
		.replace(/-+$/, "");
}

/** Why a slug can't be used, in words a person can act on, or null when it's fine. */
export function slugProblem(slug: string): string | null {
	if (slug.length < SLUG_MIN) return `Use at least ${SLUG_MIN} characters.`;
	if (slug.length > SLUG_MAX) return `Use at most ${SLUG_MAX} characters.`;
	if (!SLUG_PATTERN.test(slug) || slug.includes("--")) {
		return "Use lowercase letters, numbers and single hyphens, starting and ending with a letter or number.";
	}
	if (RESERVED.has(slug)) return "That name is reserved. Try another.";
	return null;
}
