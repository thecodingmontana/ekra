import { enrollmentStatus, type ReminderKind, tenantUrls } from "@ekra/core";
import {
	contentCompletion,
	contentItem,
	enrollment,
	member,
	organization,
	type Tx,
	user,
} from "@ekra/db";
import { reminderEmail } from "@ekra/email";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.ts";
import { sendInBackground } from "../email.ts";
import { env } from "../env.ts";
import {
	asMember,
	type Ctx,
	findOne,
	manage,
	parse,
	refuse,
	toGraphQL,
} from "./library.ts";
import { markStarted, progressOf } from "./progress.ts";
import type { ActiveOrg } from "./tenant.ts";

/**
 * Who has been given what: trainers assign content (with start and due dates), follow each learner's progress,
 * change dates, remove people and send reminders; learners see what they were given. Inside withOrg (RLS).
 */
export const enrollmentTypeDefs = /* GraphQL */ `
	extend type Query {
		"People in the organization, to assign content to (owners, admins and trainers)."
		members(slug: String!): [Member!]!
		"Who has this content, with their progress (owners, admins and trainers)."
		enrollments(slug: String!, contentId: ID!): [Enrollment!]!
		"What you've been given, with your progress."
		myLearning(slug: String!): [MyEnrollment!]!
	}

	extend type Mutation {
		"Give content to people (or change their dates when they have it already)."
		enroll(
			slug: String!
			contentId: ID!
			userIds: [ID!]!
			startAt: String
			dueAt: String
		): [Enrollment!]!
		"New due date for these enrollments (null: no due date)."
		updateEnrollments(slug: String!, ids: [ID!]!, dueAt: String): [Enrollment!]!
		removeEnrollments(slug: String!, ids: [ID!]!): Int!
		"Email a reminder; someone reminded in the last 30 minutes waits."
		remindEnrollments(
			slug: String!
			ids: [ID!]!
			kind: ReminderKind!
		): ReminderResult!
		"Start something from the catalog yourself (it then shows in your learning, without a due date)."
		startLearning(slug: String!, contentId: ID!): Boolean!
		"Mark a page or wiki done (or not) for yourself."
		markDone(slug: String!, contentId: ID!, done: Boolean!): Boolean!
	}

	enum ReminderKind {
		running_out
		overdue
	}

	type Member {
		id: ID!
		name: String!
		email: String!
		image: String
		role: String!
	}

	type Enrollment {
		id: ID!
		contentId: ID!
		user: Author!
		startAt: String!
		dueAt: String
		"completed, overdue, not_started or in_progress"
		status: String!
		percent: Int!
		remindedAt: String
		"When another reminder may be sent (null: now)."
		remindAgainAt: String
	}

	type MyEnrollment {
		id: ID!
		content: ContentItem!
		startAt: String!
		dueAt: String
		status: String!
		percent: Int!
	}

	type ReminderResult {
		sent: Int!
		waiting: Int!
	}
`;

/** How long after a reminder another may be sent to the same person. */
const REMIND_GAP_MS = 30 * 60_000;
const TAKEABLE = new Set([
	"course",
	"path",
	"quiz",
	"page",
	"wiki",
	"assignment",
]);
const date = z.iso.datetime({ offset: true }).nullish();

/** Content that can be given to people: visible here, and not a folder. */
async function takeable(tx: Tx, org: ActiveOrg, userId: string, id: string) {
	const found = await findOne(tx, org, userId, id);
	if (!found || !TAKEABLE.has(found.item.kind))
		return refuse("That content can't be assigned.", "NOT_FOUND");
	return found.item;
}

/** These enrollments with each learner and their progress. */
async function listEnrollments(
	tx: Tx,
	where: ReturnType<typeof eq> | ReturnType<typeof and>,
) {
	const rows = await tx
		.select({
			e: enrollment,
			user: { id: user.id, name: user.name, image: user.image },
			item: { id: contentItem.id, kind: contentItem.kind },
		})
		.from(enrollment)
		.innerJoin(user, eq(user.id, enrollment.userId))
		.innerJoin(contentItem, eq(contentItem.id, enrollment.contentId))
		.where(where)
		.orderBy(desc(enrollment.createdAt));
	const byContent = new Map<string, typeof rows>();
	for (const r of rows)
		byContent.set(r.item.id, [...(byContent.get(r.item.id) ?? []), r]);
	const progress = new Map<string, { percent: number; started: boolean }>();
	for (const [, list] of byContent) {
		const first = list[0];
		if (!first) continue;
		const map = await progressOf(
			tx,
			first.item,
			list.map((r) => r.e.userId),
		);
		for (const r of list)
			progress.set(
				r.e.id,
				map.get(r.e.userId) ?? { percent: 0, started: false },
			);
	}
	return rows.map((r) => {
		const p = progress.get(r.e.id) ?? { percent: 0, started: false };
		const again = r.e.remindedAt
			? new Date(r.e.remindedAt.getTime() + REMIND_GAP_MS)
			: null;
		return {
			...r.e,
			user: r.user,
			startAt: r.e.startAt.toISOString(),
			dueAt: r.e.dueAt?.toISOString() ?? null,
			remindedAt: r.e.remindedAt?.toISOString() ?? null,
			remindAgainAt: again && again > new Date() ? again.toISOString() : null,
			percent: p.percent,
			status: enrollmentStatus({ ...p, dueAt: r.e.dueAt }),
		};
	});
}

/** This organization's address for a page (its subdomain when the install uses them). */
function orgLink(slug: string, path: string) {
	const url = new URL(`/o/${slug}${path}`, env.BETTER_AUTH_URL);
	return (tenantUrls(env.BETTER_AUTH_URL).output(url) ?? url).toString();
}

type Args<T> = { slug: string } & T;

export const enrollmentResolvers = {
	Query: {
		members: (_p: unknown, { slug }: { slug: string }, ctx: Ctx) =>
			manage(ctx, slug, async (_tx, org) =>
				// member and user aren't tenant tables: read with the organization from the request's own address
				db
					.select({
						id: user.id,
						name: user.name,
						email: user.email,
						image: user.image,
						role: member.role,
					})
					.from(member)
					.innerJoin(user, eq(user.id, member.userId))
					.where(eq(member.organizationId, org.id))
					.orderBy(user.name),
			),
		enrollments: (
			_p: unknown,
			{ slug, contentId }: Args<{ contentId: string }>,
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx, org, userId) => {
				await takeable(tx, org, userId, contentId);
				return listEnrollments(tx, eq(enrollment.contentId, contentId));
			}),
		myLearning: (_p: unknown, { slug }: { slug: string }, ctx: Ctx) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const mine = await listEnrollments(tx, eq(enrollment.userId, userId));
				const out = [];
				for (const e of mine) {
					// only what this person may see now (a learner: published, not archived)
					const found = await findOne(tx, org, userId, e.contentId);
					if (found) out.push({ ...e, content: toGraphQL(found) });
				}
				return out;
			}),
	},
	Mutation: {
		enroll: (
			_p: unknown,
			args: Args<{
				contentId: string;
				userIds: string[];
				startAt?: string | null;
				dueAt?: string | null;
			}>,
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx, org, userId) => {
				await takeable(tx, org, userId, args.contentId);
				const ids = parse(
					z.array(z.string().max(32)).min(1).max(500),
					args.userIds,
				);
				const startAt = parse(date, args.startAt);
				const dueAt = parse(date, args.dueAt);
				if (startAt && dueAt && new Date(dueAt) <= new Date(startAt))
					return refuse(
						"The due date must be after the start.",
						"BAD_USER_INPUT",
					);
				const members = await db
					.select({ id: member.userId })
					.from(member)
					.where(
						and(eq(member.organizationId, org.id), inArray(member.userId, ids)),
					);
				if (members.length !== new Set(ids).size)
					return refuse(
						"Only people in this organization can be assigned.",
						"BAD_USER_INPUT",
					);
				for (const m of members)
					await tx
						.insert(enrollment)
						.values({
							orgId: org.id,
							contentId: args.contentId,
							userId: m.id,
							assignedBy: userId,
							...(startAt && { startAt: new Date(startAt) }),
							dueAt: dueAt ? new Date(dueAt) : null,
						})
						.onConflictDoUpdate({
							target: [enrollment.contentId, enrollment.userId],
							set: {
								...(startAt && { startAt: new Date(startAt) }),
								dueAt: dueAt ? new Date(dueAt) : null,
							},
						});
				return listEnrollments(
					tx,
					and(
						eq(enrollment.contentId, args.contentId),
						inArray(enrollment.userId, ids),
					),
				);
			}),
		updateEnrollments: (
			_p: unknown,
			args: Args<{ ids: string[]; dueAt?: string | null }>,
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx) => {
				const dueAt = parse(date, args.dueAt);
				await tx
					.update(enrollment)
					.set({ dueAt: dueAt ? new Date(dueAt) : null })
					.where(inArray(enrollment.id, args.ids));
				return listEnrollments(tx, inArray(enrollment.id, args.ids));
			}),
		removeEnrollments: (
			_p: unknown,
			{ slug, ids }: Args<{ ids: string[] }>,
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx) => {
				const gone = await tx
					.delete(enrollment)
					.where(inArray(enrollment.id, ids))
					.returning({ id: enrollment.id });
				return gone.length;
			}),
		remindEnrollments: (
			_p: unknown,
			args: Args<{ ids: string[]; kind: ReminderKind }>,
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx, org) => {
				const kind = parse(z.enum(["running_out", "overdue"]), args.kind);
				const rows = await tx
					.select({
						e: enrollment,
						title: contentItem.title,
					})
					.from(enrollment)
					.innerJoin(contentItem, eq(contentItem.id, enrollment.contentId))
					.where(inArray(enrollment.id, args.ids));
				const now = Date.now();
				const due = rows.filter(
					(r) =>
						!r.e.remindedAt || now - r.e.remindedAt.getTime() >= REMIND_GAP_MS,
				);
				if (!due.length) return { sent: 0, waiting: rows.length };
				const [orgRow] = await db
					.select({ name: organization.name, slug: organization.slug })
					.from(organization)
					.where(eq(organization.id, org.id));
				// learners' email addresses aren't visible to the tenant role: read them for these people only
				const emails = new Map(
					(
						await db
							.select({ id: user.id, email: user.email })
							.from(user)
							.where(
								inArray(
									user.id,
									due.map((r) => r.e.userId),
								),
							)
					).map((u) => [u.id, u.email]),
				);
				const from =
					(ctx.session as { user?: { name?: string } } | null)?.user?.name ??
					"Your trainer";
				for (const r of due) {
					const to = emails.get(r.e.userId);
					if (!to) continue;
					sendInBackground({
						to,
						...reminderEmail({
							kind,
							title: r.title,
							organization: orgRow?.name ?? "",
							from,
							due: r.e.dueAt
								? r.e.dueAt.toLocaleDateString("en-GB", {
										day: "numeric",
										month: "short",
										year: "numeric",
									})
								: null,
							url: orgLink(
								orgRow?.slug ?? args.slug,
								`/library/${r.e.contentId}`,
							),
						}),
					});
				}
				await tx
					.update(enrollment)
					.set({ remindedAt: new Date() })
					.where(
						inArray(
							enrollment.id,
							due.map((r) => r.e.id),
						),
					);
				return { sent: due.length, waiting: rows.length - due.length };
			}),
		startLearning: (_p: unknown, args: Args<{ contentId: string }>, ctx: Ctx) =>
			asMember(ctx, args.slug, async (tx, org, userId) => {
				await takeable(tx, org, userId, args.contentId);
				// already given it (assigned or started): keep that, with its dates
				await tx
					.insert(enrollment)
					.values({
						orgId: org.id,
						contentId: args.contentId,
						userId,
						source: "self",
					})
					.onConflictDoNothing();
				return true;
			}),
		markDone: (
			_p: unknown,
			args: Args<{ contentId: string; done: boolean }>,
			ctx: Ctx,
		) =>
			asMember(ctx, args.slug, async (tx, org, userId) => {
				const found = await findOne(tx, org, userId, args.contentId);
				if (!found || !["page", "wiki", "assignment"].includes(found.item.kind))
					return refuse("That can't be marked done.", "NOT_FOUND");
				if (args.done) {
					await tx
						.insert(contentCompletion)
						.values({ orgId: org.id, userId, contentId: args.contentId })
						.onConflictDoNothing();
					await markStarted(tx, org.id, userId, args.contentId);
				} else
					await tx
						.delete(contentCompletion)
						.where(
							and(
								eq(contentCompletion.userId, userId),
								eq(contentCompletion.contentId, args.contentId),
							),
						);
				return true;
			}),
	},
};
