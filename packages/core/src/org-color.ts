/** Colours an organization can pick for its logo letter; none picked means Ekra's green. */
export const ORG_COLORS = [
	"#2F2E2A",
	"#5A67D8",
	"#3B82C4",
	"#23918A",
	"#C54B78",
	"#C48A1E",
] as const;

export const isOrgColor = (
	value: unknown,
): value is (typeof ORG_COLORS)[number] =>
	(ORG_COLORS as readonly unknown[]).includes(value);
