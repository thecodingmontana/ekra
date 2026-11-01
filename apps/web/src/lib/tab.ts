/** This browser tab, so live updates can tell its own changes from everyone else's. */
export const TAB_ID =
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2);
