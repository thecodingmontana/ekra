import {
	answerResult,
	bestAttempt,
	enrollmentStatus,
	type QuestionPayload,
	questionStats,
} from "@ekra/core";
import {
	contentItem,
	contentView,
	enrollment,
	member,
	quizAttempt,
	quizQuestion,
	type Tx,
	user,
} from "@ekra/db";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.ts";
import { type Ctx, findOne, manage, parse, type SlugId } from "./library.ts";
import { type Progress, progressOfAll } from "./progress.ts";
import { gradeOverdue } from "./quiz.ts";

/**
 * Reports for people who manage content: who's learning and how they're doing, each piece of content's learners,
 * and one quiz's answers. Worked out from what's already stored (lessons done, attempts, pages marked done,
 * content opened, enrollments). Inside withOrg (RLS).
 */
export const reportTypeDefs = /* GraphQL */ `
	extend type Query {
		"Who's learning and how they're doing (managers)."
		learnerReport(slug: String!): LearnerReport!
		"Each piece of content of one kind with how its learners are doing (managers)."
		contentReport(slug: String!, kind: ContentKind!): [ContentReportRow!]!
		"One quiz: totals, each question's answers, and each learner's results (managers); null when not found."
		quizReport(slug: String!, id: ID!): QuizReport
	}

	type ReportPerson {
		id: ID!
		name: String!
		image: String
		role: String!
	}

	type ReportContent {
		id: ID!
		title: String!
		kind: ContentKind!
	}

	type LearnerReport {
		"members with the learner role, and every member who has something assigned or started"
		totalLearners: Int!
		"distinct people with any activity per day, the last 56 days (UTC), oldest first, every day present"
		dailyActive: [DayCount!]!
		"the 5 people with the most activity in the last 7 days"
		mostActive: [PersonCount!]!
		"newest first, at most 30: started, completed, passed, failed"
		recent: [ActivityEvent!]!
		learners: [LearnerRow!]!
	}

	type DayCount {
		"YYYY-MM-DD (UTC)"
		day: String!
		count: Int!
	}

	type PersonCount {
		person: ReportPerson!
		count: Int!
	}

	type ActivityEvent {
		at: String!
		person: ReportPerson!
		"started, completed, passed or failed"
		kind: String!
		content: ReportContent!
	}

	type LearnerRow {
		person: ReportPerson!
		assigned: Int!
		completed: Int!
		overdue: Int!
		inProgress: Int!
		"average progress over their enrollments, 0 with none"
		percent: Int!
		lastOpened: ReportContent
		lastOpenedAt: String
	}

	type ContentReportRow {
		content: ReportContent!
		"draft or published"
		status: String!
		learners: Int!
		completed: Int!
		"average progress of its learners"
		percent: Int!
		"quizzes only: average score of graded attempts, in percent"
		accuracy: Int
	}

	type QuizReport {
		content: ReportContent!
		questionCount: Int!
		"average score % of graded attempts; null with none"
		accuracy: Int
		"share of people who started it and passed (or finished, without a pass mark), in percent"
		completedPercent: Int!
		submissions: Int!
		"average seconds from start to hand-in; null with none"
		averageSeconds: Int
		questions: [QuestionStat!]!
		learners: [LearnerResult!]!
	}

	type QuestionStat {
		id: ID!
		position: Int!
		kind: String!
		prompt: String!
		points: Int!
		answered: Int!
		correct: Int!
		"multiple choice only: each choice with how often it was picked and whether it's right"
		choices: [ChoiceStat!]!
	}

	type ChoiceStat {
		label: String!
		picked: Int!
		right: Boolean!
	}

	type LearnerResult {
		person: ReportPerson!
		"their best graded attempt"
		score: Int
		maxScore: Int
		passed: Boolean
		attempts: Int!
		"one entry per question in QuizReport.questions order: true right, false wrong, null not asked or not answered"
		answers: [Boolean]!
	}
`;

const DAYS = 56;
const DAY_MS = 86_400_000;
const KINDS = z.enum([
	"folder",
	"page",
	"course",
	"quiz",
	"assignment",
	"path",
	"wiki",
]);

type Person = { id: string; name: string; image: string | null; role: string };

/** The organization's members by id (member and user aren't tenant tables: read like enrollment.ts members). */
async function people(orgId: string): Promise<Map<string, Person>> {
	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			image: user.image,
			role: member.role,
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, orgId))
		.orderBy(asc(user.name));
	return new Map(rows.map((r) => [r.id, r]));
}

const average = (list: number[]) =>
	list.length
		? Math.round(list.reduce((s, n) => s + n, 0) / list.length)
		: null;
const iso = (column: string) =>
	sql.raw(
		`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
	);

/**
 * Everything these people did, one row per thing: a lesson finished, a quiz started or handed in, a page marked
 * done, content opened (only its latest opening is kept), something started from the catalog.
 */
const activity = (userIds: string[]) => {
	const who = sql.join(
		userIds.map((u) => sql`${u}`),
		sql`, `,
	);
	return sql`(
		select user_id, course_id as content_id, completed_at as at, 'completed' as kind from lesson_progress where completed_at is not null and user_id in (${who})
		union all select user_id, quiz_id, started_at, 'attempted' from quiz_attempt where user_id in (${who})
		union all select user_id, quiz_id, submitted_at, case when passed then 'passed' when not passed then 'failed' else 'completed' end from quiz_attempt where submitted_at is not null and user_id in (${who})
		union all select user_id, content_id, completed_at, 'completed' from content_completion where user_id in (${who})
		union all select user_id, content_id, viewed_at, 'opened' from content_view where user_id in (${who})
		union all select user_id, content_id, created_at, 'started' from enrollment where source = 'self' and user_id in (${who})
	) as activity`;
};

async function learnerReport(tx: Tx, orgId: string) {
	const members = await people(orgId);
	const enrolled = await tx
		.select({
			userId: enrollment.userId,
			dueAt: enrollment.dueAt,
			item: { id: contentItem.id, kind: contentItem.kind },
		})
		.from(enrollment)
		.innerJoin(contentItem, eq(contentItem.id, enrollment.contentId));
	const learners = [...members.values()].filter(
		(m) => m.role === "learner" || enrolled.some((e) => e.userId === m.id),
	);
	const ids = learners.map((l) => l.id);
	const now = Date.now();
	const today = Math.floor(now / DAY_MS) * DAY_MS;
	const dayKeys = Array.from({ length: DAYS }, (_, i) =>
		new Date(today - (DAYS - 1 - i) * DAY_MS).toISOString().slice(0, 10),
	);
	if (!ids.length)
		return {
			totalLearners: 0,
			dailyActive: dayKeys.map((day) => ({ day, count: 0 })),
			mostActive: [],
			recent: [],
			learners: [],
		};

	// a quiz whose time ran out counts as handed in, even if nobody opened it since
	await gradeOverdue(tx, ids);
	const mine = enrolled.filter((e) => members.has(e.userId));
	const progress = await progressOfAll(
		tx,
		mine.map((e) => e.item),
		ids,
	);
	const since = new Date(today - (DAYS - 1) * DAY_MS);
	const daily = await tx.execute<{ day: string; count: number }>(sql`
		select to_char(at at time zone 'UTC', 'YYYY-MM-DD') as day, count(distinct user_id)::int as count
		from ${activity(ids)} where at >= ${since.toISOString()} group by 1`);
	const counts = new Map(daily.map((r) => [r.day, r.count]));
	const busiest = await tx.execute<{ user_id: string; count: number }>(sql`
		select user_id, count(*)::int as count from ${activity(ids)}
		where at >= ${new Date(now - 7 * DAY_MS).toISOString()}
		group by user_id order by count desc, user_id limit 5`);
	const recent = await tx.execute<{
		user_id: string;
		at: string;
		kind: string;
		id: string;
		title: string;
		content_kind: string;
	}>(sql`
		select activity.user_id, ${iso("activity.at")} as at, activity.kind, c.id, c.title, c.kind as content_kind
		from ${activity(ids)} join content_item c on c.id = activity.content_id
		where activity.kind in ('started', 'completed', 'passed', 'failed')
		order by activity.at desc limit 30`);
	const opened = await tx
		.selectDistinctOn([contentView.userId], {
			userId: contentView.userId,
			at: contentView.viewedAt,
			content: {
				id: contentItem.id,
				title: contentItem.title,
				kind: contentItem.kind,
			},
		})
		.from(contentView)
		.innerJoin(contentItem, eq(contentItem.id, contentView.contentId))
		.where(inArray(contentView.userId, ids))
		.orderBy(contentView.userId, desc(contentView.viewedAt));
	const lastOpened = new Map(opened.map((o) => [o.userId, o]));
	const person = (id: string) => members.get(id) as Person;

	return {
		totalLearners: learners.length,
		dailyActive: dayKeys.map((day) => ({ day, count: counts.get(day) ?? 0 })),
		mostActive: busiest.map((r) => ({
			person: person(r.user_id),
			count: r.count,
		})),
		recent: recent.map((r) => ({
			at: r.at,
			person: person(r.user_id),
			kind: r.kind,
			content: { id: r.id, title: r.title, kind: r.content_kind },
		})),
		learners: learners.map((l) => {
			const statuses = mine
				.filter((e) => e.userId === l.id)
				.map((e) => {
					const p: Progress = progress.get(e.item.id)?.get(l.id) ?? {
						percent: 0,
						started: false,
					};
					return {
						percent: p.percent,
						status: enrollmentStatus({ ...p, dueAt: e.dueAt }),
					};
				});
			const count = (s: string) =>
				statuses.filter((x) => x.status === s).length;
			const last = lastOpened.get(l.id);
			return {
				person: l,
				assigned: statuses.length,
				completed: count("completed"),
				overdue: count("overdue"),
				inProgress: count("in_progress"),
				percent: average(statuses.map((s) => s.percent)) ?? 0,
				lastOpened: last?.content ?? null,
				lastOpenedAt: last?.at.toISOString() ?? null,
			};
		}),
	};
}

async function contentReport(tx: Tx, kind: z.infer<typeof KINDS>) {
	const items = await tx
		.select({
			id: contentItem.id,
			title: contentItem.title,
			kind: contentItem.kind,
			status: contentItem.status,
		})
		.from(contentItem)
		.where(
			and(
				eq(contentItem.kind, kind),
				eq(contentItem.isTemplate, false),
				isNull(contentItem.archivedAt),
			),
		)
		.orderBy(asc(contentItem.title));
	if (!items.length) return [];
	const ids = items.map((i) => i.id);
	const enrolled = await tx
		.select({ contentId: enrollment.contentId, userId: enrollment.userId })
		.from(enrollment)
		.where(inArray(enrollment.contentId, ids));
	const userIds = [...new Set(enrolled.map((e) => e.userId))];
	await gradeOverdue(tx, userIds);
	const progress = await progressOfAll(tx, items, userIds);
	const accuracy =
		kind === "quiz"
			? new Map(
					(
						await tx
							.select({
								quizId: quizAttempt.quizId,
								accuracy: sql<number>`round(avg(${quizAttempt.score} * 100.0 / ${quizAttempt.maxScore}))::int`,
							})
							.from(quizAttempt)
							.where(
								and(
									inArray(quizAttempt.quizId, ids),
									sql`${quizAttempt.submittedAt} is not null and ${quizAttempt.maxScore} > 0`,
								),
							)
							.groupBy(quizAttempt.quizId)
					).map((r) => [r.quizId, r.accuracy]),
				)
			: null;
	return items.map(({ status, ...content }) => {
		const percents = enrolled
			.filter((e) => e.contentId === content.id)
			.map((e) => progress.get(content.id)?.get(e.userId)?.percent ?? 0);
		return {
			content,
			status,
			learners: percents.length,
			completed: percents.filter((p) => p >= 100).length,
			percent: average(percents) ?? 0,
			accuracy: accuracy ? (accuracy.get(content.id) ?? null) : null,
		};
	});
}

async function quizReport(
	tx: Tx,
	orgId: string,
	id: string,
	found: { id: string; title: string; kind: string },
) {
	const questions = await tx
		.select()
		.from(quizQuestion)
		.where(eq(quizQuestion.quizId, id))
		.orderBy(asc(quizQuestion.position));
	const takers = await tx
		.selectDistinct({ userId: quizAttempt.userId })
		.from(quizAttempt)
		.where(eq(quizAttempt.quizId, id));
	await gradeOverdue(
		tx,
		takers.map((t) => t.userId),
	);
	const attempts = await tx
		.select()
		.from(quizAttempt)
		.where(eq(quizAttempt.quizId, id))
		.orderBy(asc(quizAttempt.startedAt));
	const members = await people(orgId);
	const qs = questions.map((q) => ({
		id: q.id,
		payload: q.payload as QuestionPayload,
	}));
	const handedIn = attempts.filter((a) => a.submittedAt && a.score != null);
	const userIds = [...new Set(attempts.map((a) => a.userId))];
	const done = userIds.filter((u) =>
		attempts.some(
			(a) =>
				a.userId === u && (a.passed || (a.passed == null && a.submittedAt)),
		),
	);
	const stats = questionStats(qs, attempts);
	return {
		content: found,
		questionCount: questions.length,
		accuracy: average(
			handedIn
				.filter((a) => a.maxScore)
				.map((a) => ((a.score ?? 0) * 100) / (a.maxScore ?? 1)),
		),
		completedPercent: userIds.length
			? Math.round((done.length * 100) / userIds.length)
			: 0,
		submissions: handedIn.length,
		averageSeconds: average(
			handedIn.map(
				(a) => ((a.submittedAt?.getTime() ?? 0) - a.startedAt.getTime()) / 1000,
			),
		),
		questions: questions.map((q, i) => ({
			id: q.id,
			position: q.position,
			kind: q.kind,
			prompt: q.prompt,
			points: q.points,
			...stats[i],
		})),
		// people who left the organization drop out of the list (their attempts still count above)
		learners: userIds.flatMap((u) => {
			const person = members.get(u);
			if (!person) return [];
			const theirs = attempts.filter((a) => a.userId === u);
			const best = bestAttempt(theirs);
			return [
				{
					person,
					score: best?.score ?? null,
					maxScore: best?.maxScore ?? null,
					passed: best?.passed ?? null,
					attempts: theirs.length,
					answers: qs.map((q) => (best ? answerResult(q, best) : null)),
				},
			];
		}),
	};
}

export const reportResolvers = {
	Query: {
		learnerReport: (_p: unknown, { slug }: { slug: string }, ctx: Ctx) =>
			manage(ctx, slug, (tx, org) => learnerReport(tx, org.id)),
		contentReport: (
			_p: unknown,
			args: { slug: string; kind: string },
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, (tx) =>
				contentReport(tx, parse(KINDS, args.kind)),
			),
		quizReport: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx, org, userId) => {
				const found = await findOne(tx, org, userId, id);
				if (found?.item.kind !== "quiz") return null;
				const { id: itemId, title, kind } = found.item;
				return quizReport(tx, org.id, id, { id: itemId, title, kind });
			}),
	},
};
