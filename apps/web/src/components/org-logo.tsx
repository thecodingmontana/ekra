import type { CSSProperties } from "react";

/** The organization's logo, or its first letter on its colour (Ekra's green when it has none). */
export function OrgLogo({
	organization,
	px = 22,
}: {
	organization: { name: string; logo: string | null; color: string | null };
	px?: number;
}) {
	const style = { width: px, height: px } as CSSProperties;
	if (organization.logo)
		return (
			<img
				src={organization.logo}
				alt=""
				style={style}
				className="shrink-0 rounded-[6px] object-cover"
			/>
		);
	return (
		<span
			aria-hidden
			style={{
				...style,
				fontSize: Math.max(9, Math.round(px * 0.46)),
				...(organization.color && { background: organization.color }),
			}}
			className={
				organization.color
					? "grid shrink-0 place-items-center rounded-[6px] font-semibold text-white"
					: "grid shrink-0 place-items-center rounded-[6px] bg-brand font-semibold text-brand-foreground"
			}
		>
			{organization.name[0]?.toUpperCase()}
		</span>
	);
}
