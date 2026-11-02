import { organization } from "@ekra/db";
import { eq } from "drizzle-orm";
import { log } from "evlog";
import { type DocumentNode, getOperationAST, Kind } from "graphql";
import { db, listen, notify } from "./db.ts";

/**
 * Live updates: after anything changes in an organization, everyone who has it open is told "something changed"
 * and their browser refetches what's on screen through the signed-in API. The message carries no data, only who
 * made the change (their tab skips the refresh). Postgres NOTIFY fans it out, so it reaches every server process.
 */

const CHANNEL = "ekra_changed";

type Listener = (from: string | null) => void;
const listeners = new Map<string, Set<Listener>>();
let listening: Promise<unknown> | undefined;

/** Hear about changes in one organization until the returned `stop` is called. */
export async function onChange(orgId: string, listener: Listener) {
	listening ??= listen(CHANNEL, (payload) => {
		try {
			const { org, from } = JSON.parse(payload) as {
				org: string;
				from: string | null;
			};
			for (const l of listeners.get(org) ?? []) l(from);
		} catch (error) {
			log.error({ action: "realtime.receive", error: String(error) });
		}
	}).catch((error: unknown) => {
		// the next subscriber tries again
		listening = undefined;
		throw error;
	});
	await listening;
	const set = listeners.get(orgId) ?? new Set();
	set.add(listener);
	listeners.set(orgId, set);
	return () => {
		set.delete(listener);
		// only this set: a stop that runs late must not drop a newer viewer's
		if (!set.size && listeners.get(orgId) === set) listeners.delete(orgId);
	};
}

const openStreams = new Set<() => void>();

/** Keeps track of an open live-updates stream so shutdown can end it; returns the function that forgets it. */
export function trackStream(close: () => void) {
	openStreams.add(close);
	return () => openStreams.delete(close);
}

/** Ends every open stream (on shutdown: they'd otherwise keep the server waiting; browsers reconnect). */
export function closeStreams() {
	for (const close of openStreams) close();
	openStreams.clear();
}

/** Tell everyone viewing these organizations (by address) to refresh. Never slows down or fails the change. */
export function announceChange(slugs: string[], from: string | null) {
	if (!slugs.length) return;
	void (async () => {
		for (const slug of slugs) {
			const [org] = await db
				.select({ id: organization.id })
				.from(organization)
				.where(eq(organization.slug, slug));
			if (org) await notify(CHANNEL, JSON.stringify({ org: org.id, from }));
		}
	})().catch((error: unknown) =>
		log.error({ action: "realtime.announce", error: String(error) }),
	);
}

/**
 * Mutations nobody else needs to see at once: personal ones (opened, starred, progress) and autosaves (every few
 * seconds while someone types; co-editors are protected by the conflict check, readers get it on their next open).
 */
const QUIET = new Set([
	"viewContent",
	"favoriteContent",
	"saveContentBody",
	"saveLessonBody",
	"completeLesson",
	"saveLessonPosition",
]);

/** The organizations a mutation changed: its fields' `slug` argument, as written or as a variable. */
export function mutationSlugs(
	document: DocumentNode,
	variables: Record<string, unknown> | null | undefined,
	operationName?: string | null,
): string[] {
	const op = getOperationAST(document, operationName);
	if (op?.operation !== "mutation") return [];
	const slugs = new Set<string>();
	for (const field of op.selectionSet.selections) {
		if (field.kind !== Kind.FIELD || QUIET.has(field.name.value)) continue;
		const arg = field.arguments?.find((a) => a.name.value === "slug")?.value;
		const value =
			arg?.kind === Kind.STRING
				? arg.value
				: arg?.kind === Kind.VARIABLE
					? variables?.[arg.name.value]
					: undefined;
		if (typeof value === "string") slugs.add(value);
	}
	return [...slugs];
}
