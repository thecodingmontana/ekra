import { Button } from "@ekra/ui/components/button";
import { useEffect, useState } from "react";
import { isDark, setTheme } from "@/lib/theme";

/** Light/dark switch for pages outside the app shell (onboarding, home header). */
export function ThemeToggle() {
	// the server can't know the theme, so read it after mount (moon first)
	const [dark, setDark] = useState(false);
	useEffect(() => setDark(isDark()), []);

	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
			data-testid="theme-toggle"
			onClick={() => {
				setTheme(dark ? "light" : "dark");
				setDark(!dark);
			}}
		>
			<span
				className={`${dark ? "icon-[solar--sun-2-linear]" : "icon-[solar--moon-linear]"} size-4`}
				aria-hidden="true"
			/>
		</Button>
	);
}
