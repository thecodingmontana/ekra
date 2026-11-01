const SETTLE_MS = 400;

/**
 * Runs `run` soon after a call, once for a burst of calls (a bulk edit becomes one refresh), and no more often
 * than every `gapMs`. `cancel` drops a pending run.
 */
export function spaced(run: () => unknown, gapMs = 3000, settleMs = SETTLE_MS) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let last = Number.NEGATIVE_INFINITY;
	const call = () => {
		if (timer) return;
		timer = setTimeout(
			() => {
				timer = undefined;
				last = Date.now();
				void run();
			},
			Math.max(settleMs, last + gapMs - Date.now()),
		);
	};
	call.cancel = () => {
		clearTimeout(timer);
		timer = undefined;
	};
	return call;
}
