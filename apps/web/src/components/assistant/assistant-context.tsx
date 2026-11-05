import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

// Whether the assistant's panel is open, shared by the sidebar button, the ⌘J shortcut and the panel. Kept apart
// from the panel itself, so pages don't load the whole chat until it's opened.

/** The assistant's name, as people see it (the server's prompt uses the same one). */
export const ASSISTANT = "Ari";

type Ctx = {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
};

// a closed panel when there's no provider (a hot reload briefly makes a new context), never a crash
const CLOSED: Ctx = { open: false, setOpen: () => {}, toggle: () => {} };
const AssistantContext = createContext<Ctx>(CLOSED);

export const useAssistant = () => useContext(AssistantContext);

const KEY = "ekra-assistant-open";

export function AssistantProvider({ children }: { children: ReactNode }) {
	const [open, setOpenState] = useState(false);
	const setOpen = (next: boolean) => {
		setOpenState(next);
		try {
			localStorage.setItem(KEY, next ? "1" : "0");
		} catch {}
	};
	// reopens where you left it, after the first render so the server's page and the browser's agree
	useEffect(() => {
		try {
			if (localStorage.getItem(KEY) === "1") setOpenState(true);
		} catch {}
	}, []);
	// ⌘J / Ctrl+J opens and closes it from anywhere
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== "j" || !(e.metaKey || e.ctrlKey)) return;
			e.preventDefault();
			setOpenState((was) => {
				try {
					localStorage.setItem(KEY, was ? "0" : "1");
				} catch {}
				return !was;
			});
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	return (
		<AssistantContext.Provider
			value={{ open, setOpen, toggle: () => setOpen(!open) }}
		>
			{children}
		</AssistantContext.Provider>
	);
}
