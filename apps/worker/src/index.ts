import { log } from "evlog";
import { close, drain, listen } from "./videos.ts";

/** Same channel the API notifies when an upload finishes (apps/server/src/media.ts). */
const JOBS_CHANNEL = "ekra_jobs";
/** A check now and then also picks up retries whose wait is over. */
const POLL_MS = 60_000;

let running: Promise<void> = Promise.resolve();
let again = false;

/** One drain at a time; a wake-up during a drain runs one more afterwards. */
function wake() {
	if (again) return;
	again = true;
	running = running.then(async () => {
		again = false;
		await drain().catch((error: unknown) =>
			log.error({ action: "worker.drain", error: String(error) }),
		);
	});
}

await listen(JOBS_CHANNEL, wake);
const timer = setInterval(wake, POLL_MS);
wake();
log.info("worker", "Ekra worker is waiting for videos");

// finish the current video, then stop (Ctrl+C, docker stop)
for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.once(signal, () => {
		clearInterval(timer);
		void running.then(() => close()).then(() => process.exit(0));
	});
