/** A display name from an email address: "amina.k@acme.com" → "Amina K". */
export function nameFromEmail(email: string): string {
	const words = (email.split("@")[0] ?? "").split(/[._+-]+/).filter(Boolean);
	return (
		words
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ") || "New member"
	);
}
