import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SBlock, SettingsHeader } from "@/components/settings-ui";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/_authed/settings/appearance")({
	head: () => ({ meta: [{ title: "Appearance · Ekra" }] }),
	component: Appearance,
});

// the colours of a tiny app drawn in each theme card
const LIGHT = {
	bg: "#FBFAF8",
	s: "#F2F1EE",
	t: "#1D1C1A",
	b: "#E3E1DC",
	a: "#00DF82",
};
const DARK = {
	bg: "#1D1D1C",
	s: "#151514",
	t: "#ECEAE5",
	b: "#333230",
	a: "#00DF82",
};

/** A miniature of the app in one theme: sidebar lines on the left, a page on the right. */
function Preview({ c }: { c: typeof LIGHT }) {
	const bar = (background: string, width: string, height = 5) => (
		<i className="block rounded-[3px]" style={{ background, width, height }} />
	);
	return (
		<div className="grid h-full grid-cols-[30%_1fr]">
			<div
				className="flex flex-col gap-1 px-1.5 py-2"
				style={{ background: c.s }}
			>
				{bar(c.b, "70%")}
				{bar(c.a, "55%")}
				{bar(c.b, "80%")}
				{bar(c.b, "60%")}
			</div>
			<div
				className="flex flex-col gap-[5px] p-2.5"
				style={{ background: c.bg }}
			>
				{bar(c.t, "45%", 7)}
				{bar(c.b, "100%")}
				{bar(c.b, "80%")}
				<span className="mt-1">{bar(c.a, "30%", 10)}</span>
			</div>
		</div>
	);
}

const CHOICES = [
	["light", "Light", "icon-[solar--sun-2-linear]"],
	["dark", "Dark", "icon-[solar--moon-linear]"],
	["system", "System", "icon-[solar--monitor-linear]"],
] as const;

function Appearance() {
	// the server can't know the theme, so read it after mount
	const [theme, setChoice] = useState<Theme>("system");
	useEffect(() => setChoice(getTheme()), []);

	return (
		<>
			<SettingsHeader
				title="Appearance"
				lead="How Ekra looks on this device."
			/>
			<SBlock title="Theme" first>
				<fieldset className="mt-3 grid max-w-[720px] grid-cols-3 gap-3">
					<legend className="sr-only">Theme</legend>
					{CHOICES.map(([choice, label, icon]) => (
						<label
							key={choice}
							className={cn(
								"flex cursor-pointer flex-col gap-2 rounded-[10px] border p-2 text-left transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 has-focus-visible:ring-2 has-focus-visible:ring-ring",
								theme === choice &&
									"border-brand shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_18%,transparent)] hover:border-brand",
							)}
						>
							<input
								type="radio"
								name="theme"
								className="sr-only"
								checked={theme === choice}
								onChange={() => {
									setTheme(choice);
									setChoice(choice);
								}}
							/>
							<div className="h-[84px] overflow-hidden rounded-md border border-[rgba(128,128,128,0.2)]">
								{choice === "system" ? (
									<div className="grid h-full grid-cols-2">
										<Preview c={LIGHT} />
										<Preview c={DARK} />
									</div>
								) : (
									<Preview c={choice === "light" ? LIGHT : DARK} />
								)}
							</div>
							<span className="flex items-center gap-1.5 font-medium text-[13px]">
								<span aria-hidden className={cn(icon, "size-3.5")} />
								{label}
								{theme === choice && (
									<span
										aria-hidden
										className="ml-auto icon-[solar--check-circle-bold] size-[15px] text-brand"
									/>
								)}
							</span>
						</label>
					))}
				</fieldset>
			</SBlock>
		</>
	);
}
