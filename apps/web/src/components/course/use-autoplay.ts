import { useEffect, useState } from "react";

const key = (userId: string) => `ekra:autoplay:${userId}`;

/** "Play the next video when one ends", remembered per person in this browser (on unless turned off). */
export function useAutoplay(userId: string) {
	const [on, setOn] = useState(true);
	useEffect(() => {
		try {
			setOn(localStorage.getItem(key(userId)) !== "0");
		} catch {
			// storage blocked: keep the default
		}
	}, [userId]);
	const set = (next: boolean) => {
		setOn(next);
		try {
			localStorage.setItem(key(userId), next ? "1" : "0");
		} catch {
			// storage blocked: it lasts until the page closes
		}
	};
	return [on, set] as const;
}
