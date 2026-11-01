// Per-device light/dark choice, applied to <html> before first paint (see THEME_SCRIPT). No choice yet = follow the system.
const KEY = "ekra.theme";

/** Inline script for <head>: runs before React so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export const isDark = () =>
	typeof document !== "undefined" &&
	document.documentElement.classList.contains("dark");

export type Theme = "light" | "dark" | "system";

/** The saved choice; "system" when none (follow the device). */
export function getTheme(): Theme {
	try {
		const saved = localStorage.getItem(KEY);
		if (saved === "light" || saved === "dark") return saved;
	} catch {}
	return "system";
}

export function setTheme(choice: Theme) {
	try {
		if (choice === "system") localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, choice);
	} catch {}
	const theme =
		choice === "system"
			? matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light"
			: choice;
	const root = document.documentElement;
	// switch off every colour transition for the swap, so the change doesn't smear
	const style = document.createElement("style");
	style.textContent = "*,*::before,*::after{transition:none!important}";
	document.head.appendChild(style);
	root.classList.toggle("dark", theme === "dark");
	root.style.colorScheme = theme;
	getComputedStyle(root).opacity; // flush styles before transitions come back
	requestAnimationFrame(() => style.remove());
}
