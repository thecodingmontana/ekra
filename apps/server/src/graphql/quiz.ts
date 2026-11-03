import {
	isCorrect,
	isImageSrc,
	publicQuestion,
	type QuestionPayload,
	questionAnswer,
	questionPayload,
	questionProblem,
	seededShuffle,
} from "@ekra/core";
import {
	lesson,
	lessonProgress,
	quiz,
	quizAttempt,
	quizQuestion,
	type Tx,
} from "@ekra/db";
import { and, asc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
	asMember,
	type Ctx,
	findOne,
	manage,
	parse,
	place,
	refuse,
	renumber,
	type SlugId,
} from "./library.ts";
import { markStarted } from "./progress.ts";
import type { ActiveOrg } from "./tenant.ts";

/**
 * Quizzes (content of kind quiz): trainers set them up and write questions; learners take attempts, which the
 * server grades. Learners never receive right answers before they're allowed to (settings.showAnswers).
 */
export const quizTypeDefs = /* GraphQL */ `
	extend type Query {
		"A quiz's settings and questions with their answers (owners, admins and trainers)."
		quizEditor(slug: String!, id: ID!): QuizEditor
		"What a learner needs before starting: the rules, and their own attempts."
		quizOverview(slug: String!, id: ID!): QuizOverview
		"One of your attempts: its questions (without answers), what you've answered, and the result once submitted."
		quizAttempt(slug: String!, id: ID!): QuizAttempt
	}

	extend type Mutation {
		updateQuizSettings(
			slug: String!
			id: ID!
			input: QuizSettingsInput!
		): QuizEditor!
		addQuestion(slug: String!, quizId: ID!, input: QuestionInput!): QuizQuestion!
		updateQuestion(slug: String!, id: ID!, input: QuestionInput!): QuizQuestion!
		deleteQuestion(slug: String!, id: ID!): Boolean!
		moveQuestion(slug: String!, id: ID!, position: Int!): Boolean!
		"Starts an attempt, or returns the one you haven't finished."
		startQuizAttempt(slug: String!, quizId: ID!): QuizAttempt!
		"Saves an answer (JSON). With answers shown after each question, says whether it's right and locks it."
		saveQuizAnswer(
			slug: String!
			attemptId: ID!
			questionId: ID!
			answer: String!
		): QuizAnswerCheck!
		submitQuizAttempt(slug: String!, attemptId: ID!): QuizAttempt!
	}

	enum QuizShowAnswers {
		never
		after_each
		at_end
	}

	type QuizSettings {
		passPercent: Int
		timeLimitSeconds: Int
		maxAttempts: Int
		poolSize: Int
		shuffleQuestions: Boolean!
		shuffleOptions: Boolean!
		showAnswers: QuizShowAnswers!
		passMessage: String
		failMessage: String
	}

	input QuizSettingsInput {
		passPercent: Int
		timeLimitSeconds: Int
		maxAttempts: Int
		poolSize: Int
		shuffleQuestions: Boolean
		shuffleOptions: Boolean
		showAnswers: QuizShowAnswers
		passMessage: String
		failMessage: String
	}

	type QuizEditor {
		id: ID!
		settings: QuizSettings!
		questions: [QuizQuestion!]!
	}

	type QuizQuestion {
		id: ID!
		position: Int!
		kind: String!
		prompt: String!
		image: String
		"The choices, blanks or areas with the right answers (JSON)."
		payload: String!
		points: Int!
		required: Boolean!
		explanation: String
	}

	input QuestionInput {
		"multiple_choice, fill_blank or hotspot"
		kind: String!
		prompt: String!
		image: String
		payload: String!
		points: Int
		required: Boolean
		explanation: String
	}

	type QuizOverview {
		id: ID!
		settings: QuizSettings!
		questionCount: Int!
		attempts: [QuizAttemptSummary!]!
		"An attempt you started and haven't finished, to continue."
		openAttemptId: ID
		attemptsLeft: Int
	}

	type QuizAttemptSummary {
		id: ID!
		startedAt: String!
		submittedAt: String
		score: Int
		maxScore: Int
		passed: Boolean
	}

	type QuizAttempt {
		id: ID!
		quizId: ID!
		startedAt: String!
		deadline: String
		submittedAt: String
		questions: [AttemptQuestion!]!
		"Your answers so far (JSON: question id → answer)."
		answers: String!
		showAnswers: QuizShowAnswers!
		result: QuizResult
	}

	type AttemptQuestion {
		id: ID!
		kind: String!
		prompt: String!
		image: String
		points: Int!
		required: Boolean!
		"What's shown to answer it, without the right answers (JSON)."
		data: String!
	}

	type QuizResult {
		score: Int!
		maxScore: Int!
		"null when the quiz has no pass mark"
		passed: Boolean
		message: String
		"Per question: right or not, and (when the quiz shows answers) the right answer and the explanation."
		review: [QuestionReview!]!
	}

	type QuestionReview {
		questionId: ID!
		correct: Boolean!
		"JSON, or null when the quiz doesn't show answers"
		correctAnswer: String
		explanation: String
	}

	type QuizAnswerCheck {
		saved: Boolean!
		"Only when answers are shown after each question."
		correct: Boolean
		correctAnswer: String
		explanation: String
	}
`;

/** A few seconds' grace after the deadline, for answers already on their way. */
const GRACE_MS = 30_000;
const DEFAULTS = {
	passPercent: null,
	timeLimitSeconds: null,
	maxAttempts: null,
	poolSize: null,
	shuffleQuestions: false,
	shuffleOptions: true,
	showAnswers: "at_end" as const,
	passMessage: null,
	failMessage: null,
};

const settingsInput = z.object({
	passPercent: z.number().int().min(1).max(100).nullish(),
	timeLimitSeconds: z
		.number()
		.int()
		.min(30)
		.max(24 * 3600)
		.nullish(),
	maxAttempts: z.number().int().min(1).max(100).nullish(),
	poolSize: z.number().int().min(1).max(500).nullish(),
	shuffleQuestions: z.boolean().optional(),
	shuffleOptions: z.boolean().optional(),
	showAnswers: z.enum(["never", "after_each", "at_end"]).optional(),
	passMessage: z.string().trim().max(500).nullish(),
	failMessage: z.string().trim().max(500).nullish(),
});

const questionInput = z.object({
	kind: z.enum(["multiple_choice", "fill_blank", "hotspot"]),
	prompt: z.string().trim().min(1, "Write the question.").max(1000),
	image: z.string().refine(isImageSrc, "Upload the picture here.").nullish(),
	payload: z.string().max(100_000),
	points: z.number().int().min(0).max(100).optional(),
	required: z.boolean().optional(),
	explanation: z.string().trim().max(2000).nullish(),
});

/** A question's payload, checked: the right shape for its kind, answerable, pictures only from Ekra. */
function checkedPayload(kind: string, raw: string): QuestionPayload {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return refuse("Bad question content.", "BAD_USER_INPUT");
	}
	const payload = parse(questionPayload, { ...(json as object), kind });
	const problem = questionProblem(payload);
	if (problem) return refuse(problem, "BAD_USER_INPUT");
	const pictures =
		payload.kind === "hotspot"
			? [payload.image]
			: payload.kind === "multiple_choice"
				? payload.options.flatMap((o) => (o.image ? [o.image] : []))
				: [];
	if (pictures.some((p) => !isImageSrc(p)))
		return refuse("Upload the picture here.", "BAD_USER_INPUT");
	return payload;
}

/** The quiz when this person may see it, else NOT_FOUND. */
async function visibleQuiz(tx: Tx, org: ActiveOrg, userId: string, id: string) {
	const found = await findOne(tx, org, userId, id);
	if (found?.item.kind !== "quiz")
		return refuse("That quiz doesn't exist or was deleted.", "NOT_FOUND");
	const [settings] = await tx.select().from(quiz).where(eq(quiz.contentId, id));
	return { item: found.item, settings: settings ?? DEFAULTS };
}

const questionsOf = (tx: Tx, quizId: string) =>
	tx
		.select()
		.from(quizQuestion)
		.where(eq(quizQuestion.quizId, quizId))
		.orderBy(asc(quizQuestion.position));

const toQuestion = (q: typeof quizQuestion.$inferSelect) => ({
	...q,
	payload: JSON.stringify(q.payload),
});

/** The right answer in a form a review can show (JSON). */
function correctAnswerOf(p: QuestionPayload) {
	if (p.kind === "multiple_choice") return JSON.stringify(p.correct);
	if (p.kind === "fill_blank")
		return JSON.stringify(
			Object.fromEntries(p.blanks.map((b) => [b.id, b.answers[0]])),
		);
	return JSON.stringify(p.areas);
}

/**
 * One of this person's attempts (someone else's answers like a missing one), locked until the change commits so
 * two answers saved at once can't overwrite each other.
 */
async function ownAttempt(tx: Tx, userId: string, id: string) {
	const [attempt] = await tx
		.select()
		.from(quizAttempt)
		.where(and(eq(quizAttempt.id, id), eq(quizAttempt.userId, userId)))
		.for("update");
	return attempt ?? refuse("That attempt doesn't exist.", "NOT_FOUND");
}

type Attempt = typeof quizAttempt.$inferSelect;
type Settings = Awaited<ReturnType<typeof visibleQuiz>>["settings"];

/** The time limit has run out (with a short grace for answers on their way). */
const timeUp = (a: Attempt, graceMs = 0) =>
	!!a.deadline && Date.now() > a.deadline.getTime() + graceMs;

/** An attempt as its learner sees it. */
async function attemptView(tx: Tx, attempt: Attempt, settings: Settings) {
	const byId = new Map(
		(await questionsOf(tx, attempt.quizId)).map((q) => [q.id, q]),
	);
	const asked = attempt.questionIds.flatMap((id) => {
		const q = byId.get(id);
		return q ? [q] : [];
	});
	const reveal = settings.showAnswers !== "never";
	return {
		...attempt,
		startedAt: attempt.startedAt.toISOString(),
		deadline: attempt.deadline?.toISOString() ?? null,
		submittedAt: attempt.submittedAt?.toISOString() ?? null,
		questions: asked.map((q) => {
			const shown = publicQuestion(q.id, q.payload as QuestionPayload);
			const data =
				"options" in shown && settings.shuffleOptions
					? {
							...shown,
							options: seededShuffle(
								shown.options ?? [],
								`${attempt.id}:${q.id}`,
							),
						}
					: shown;
			return {
				id: q.id,
				kind: q.kind,
				prompt: q.prompt,
				image: q.image,
				points: q.points,
				required: q.required,
				data: JSON.stringify(data),
			};
		}),
		answers: JSON.stringify(attempt.answers),
		showAnswers: settings.showAnswers,
		result: attempt.submittedAt
			? {
					score: attempt.score ?? 0,
					maxScore: attempt.maxScore ?? 0,
					passed: attempt.passed,
					message:
						attempt.passed === false
							? settings.failMessage
							: settings.passMessage,
					review: asked.map((q) => {
						const p = q.payload as QuestionPayload;
						return {
							questionId: q.id,
							correct: isCorrect(p, attempt.answers[q.id]),
							correctAnswer: reveal ? correctAnswerOf(p) : null,
							explanation: reveal ? q.explanation : null,
						};
					}),
				}
			: null,
	};
}

/**
 * Scores an attempt and hands it in. Passing (or finishing a quiz without a pass mark) completes the course lessons
 * that use it. After the deadline (late) required questions don't apply; before it they must be answered.
 */
async function grade(
	tx: Tx,
	attempt: Attempt,
	settings: Settings,
	late: boolean,
) {
	const byId = new Map(
		(await questionsOf(tx, attempt.quizId)).map((q) => [q.id, q]),
	);
	const asked = attempt.questionIds.flatMap((id) => {
		const q = byId.get(id);
		return q ? [q] : [];
	});
	const missing = asked.findIndex(
		(q) => q.required && !(q.id in attempt.answers),
	);
	if (missing >= 0 && !late)
		return refuse(`Answer question ${missing + 1} first.`, "BAD_USER_INPUT");
	const maxScore = asked.reduce((s, q) => s + q.points, 0);
	const score = asked.reduce(
		(s, q) =>
			s +
			(isCorrect(q.payload as QuestionPayload, attempt.answers[q.id])
				? q.points
				: 0),
		0,
	);
	const passed =
		settings.passPercent == null
			? null
			: maxScore > 0 && score * 100 >= settings.passPercent * maxScore;
	const [done] = await tx
		.update(quizAttempt)
		.set({ submittedAt: new Date(), score, maxScore, passed })
		.where(and(eq(quizAttempt.id, attempt.id), isNull(quizAttempt.submittedAt)))
		.returning();
	if (!done) return attempt;
	if (passed !== false) {
		const lessons = await tx
			.select({ id: lesson.id, courseId: lesson.courseId })
			.from(lesson)
			.where(eq(lesson.quizId, attempt.quizId));
		for (const l of lessons)
			await tx
				.insert(lessonProgress)
				.values({
					orgId: attempt.orgId,
					userId: attempt.userId,
					lessonId: l.id,
					courseId: l.courseId,
					completedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [lessonProgress.userId, lessonProgress.lessonId],
					set: { completedAt: new Date(), updatedAt: new Date() },
				});
	}
	return done;
}

/** Hands in, graded, the attempts whose time ran out without being handed in. */
const gradeTimedOut = (tx: Tx, attempts: Attempt[], settings: Settings) =>
	Promise.all(
		attempts.map((a) =>
			!a.submittedAt && timeUp(a, GRACE_MS) ? grade(tx, a, settings, true) : a,
		),
	);

/** Grades every attempt by these people whose time ran out unsubmitted, so progress lists show its result. */
export async function gradeOverdue(tx: Tx, userIds: string[]) {
	if (!userIds.length) return;
	const overdue = await tx
		.select()
		.from(quizAttempt)
		.where(
			and(
				inArray(quizAttempt.userId, userIds),
				isNull(quizAttempt.submittedAt),
				lt(quizAttempt.deadline, new Date(Date.now() - GRACE_MS)),
			),
		);
	for (const a of overdue) {
		const [settings] = await tx
			.select()
			.from(quiz)
			.where(eq(quiz.contentId, a.quizId));
		await grade(tx, a, settings ?? DEFAULTS, true);
	}
}

type Args<T> = SlugId & T;

export const quizResolvers = {
	Query: {
		quizEditor: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx, org, userId) => {
				const { settings } = await visibleQuiz(tx, org, userId, id);
				return {
					id,
					settings,
					questions: (await questionsOf(tx, id)).map(toQuestion),
				};
			}),
		quizOverview: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const { settings } = await visibleQuiz(tx, org, userId, id);
				const attempts = await gradeTimedOut(
					tx,
					await tx
						.select()
						.from(quizAttempt)
						.where(
							and(eq(quizAttempt.quizId, id), eq(quizAttempt.userId, userId)),
						)
						.orderBy(asc(quizAttempt.startedAt)),
					settings,
				);
				const count = (await questionsOf(tx, id)).length;
				const used = attempts.filter(
					(a) => a.submittedAt || timeUp(a, GRACE_MS),
				).length;
				const open = attempts.find(
					(a) => !a.submittedAt && !timeUp(a, GRACE_MS),
				);
				return {
					id,
					settings,
					questionCount: settings.poolSize
						? Math.min(settings.poolSize, count)
						: count,
					attempts: attempts.map((a) => ({
						...a,
						startedAt: a.startedAt.toISOString(),
						submittedAt: a.submittedAt?.toISOString() ?? null,
					})),
					openAttemptId: open?.id ?? null,
					attemptsLeft: settings.maxAttempts
						? Math.max(0, settings.maxAttempts - used)
						: null,
				};
			}),
		quizAttempt: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const [attempt] = await tx
					.select()
					.from(quizAttempt)
					.where(and(eq(quizAttempt.id, id), eq(quizAttempt.userId, userId)));
				if (!attempt) return null;
				const { settings } = await visibleQuiz(tx, org, userId, attempt.quizId);
				const [graded = attempt] = await gradeTimedOut(tx, [attempt], settings);
				return attemptView(tx, graded, settings);
			}),
	},
	Mutation: {
		updateQuizSettings: (
			_p: unknown,
			{ slug, id, input }: Args<{ input: unknown }>,
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx, org, userId) => {
				await visibleQuiz(tx, org, userId, id);
				const data = parse(settingsInput, input);
				await tx
					.insert(quiz)
					.values({ ...DEFAULTS, ...data, contentId: id, orgId: org.id })
					.onConflictDoUpdate({ target: quiz.contentId, set: data });
				const { settings } = await visibleQuiz(tx, org, userId, id);
				return {
					id,
					settings,
					questions: (await questionsOf(tx, id)).map(toQuestion),
				};
			}),
		addQuestion: (
			_p: unknown,
			args: { slug: string; quizId: string; input: unknown },
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx, org, userId) => {
				await visibleQuiz(tx, org, userId, args.quizId);
				const input = parse(questionInput, args.input);
				const payload = checkedPayload(input.kind, input.payload);
				const position = (await questionsOf(tx, args.quizId)).length;
				const [created] = await tx
					.insert(quizQuestion)
					.values({
						...input,
						payload,
						orgId: org.id,
						quizId: args.quizId,
						position,
					})
					.returning();
				return created
					? toQuestion(created)
					: refuse("Couldn't add the question.", "INTERNAL");
			}),
		updateQuestion: (_p: unknown, args: Args<{ input: unknown }>, ctx: Ctx) =>
			manage(ctx, args.slug, async (tx) => {
				const input = parse(questionInput, args.input);
				const payload = checkedPayload(input.kind, input.payload);
				const [updated] = await tx
					.update(quizQuestion)
					.set({ ...input, payload })
					.where(eq(quizQuestion.id, args.id))
					.returning();
				return updated
					? toQuestion(updated)
					: refuse("That question doesn't exist.", "NOT_FOUND");
			}),
		deleteQuestion: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx) => {
				const [gone] = await tx
					.delete(quizQuestion)
					.where(eq(quizQuestion.id, id))
					.returning({ quizId: quizQuestion.quizId });
				if (!gone) return refuse("That question doesn't exist.", "NOT_FOUND");
				await renumber(
					tx,
					quizQuestion,
					(await questionsOf(tx, gone.quizId)).map((q) => q.id),
				);
				return true;
			}),
		moveQuestion: (
			_p: unknown,
			{ slug, id, position }: Args<{ position: number }>,
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx) => {
				const [moving] = await tx
					.select({ quizId: quizQuestion.quizId })
					.from(quizQuestion)
					.where(eq(quizQuestion.id, id));
				if (!moving) return refuse("That question doesn't exist.", "NOT_FOUND");
				const others = (
					await tx
						.select({ id: quizQuestion.id })
						.from(quizQuestion)
						.where(
							and(
								eq(quizQuestion.quizId, moving.quizId),
								ne(quizQuestion.id, id),
							),
						)
						.orderBy(asc(quizQuestion.position))
				).map((q) => q.id);
				await renumber(tx, quizQuestion, place(others, id, position));
				return true;
			}),
		startQuizAttempt: (
			_p: unknown,
			{ slug, quizId }: { slug: string; quizId: string },
			ctx: Ctx,
		) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const { settings } = await visibleQuiz(tx, org, userId, quizId);
				// one start at a time per person and quiz, so a double click can't use up two attempts
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${quizId}`}))`,
				);
				const mine = await gradeTimedOut(
					tx,
					await tx
						.select()
						.from(quizAttempt)
						.where(
							and(
								eq(quizAttempt.quizId, quizId),
								eq(quizAttempt.userId, userId),
							),
						),
					settings,
				);
				const open = mine.find((a) => !a.submittedAt && !timeUp(a, GRACE_MS));
				if (open) return attemptView(tx, open, settings);
				const used = mine.length;
				if (settings.maxAttempts && used >= settings.maxAttempts)
					return refuse(
						"You've used all your attempts at this quiz.",
						"FORBIDDEN",
					);
				const ids = (await questionsOf(tx, quizId)).map((q) => q.id);
				if (!ids.length)
					return refuse("This quiz has no questions yet.", "BAD_USER_INPUT");
				const ordered =
					settings.shuffleQuestions || settings.poolSize
						? seededShuffle(ids, `${userId}:${quizId}:${used}`)
						: ids;
				const [attempt] = await tx
					.insert(quizAttempt)
					.values({
						orgId: org.id,
						quizId,
						userId,
						questionIds: settings.poolSize
							? ordered.slice(0, settings.poolSize)
							: ordered,
						deadline: settings.timeLimitSeconds
							? new Date(Date.now() + settings.timeLimitSeconds * 1000)
							: null,
					})
					.returning();
				if (!attempt) return refuse("Couldn't start the quiz.", "INTERNAL");
				await markStarted(tx, org.id, userId, quizId);
				return attemptView(tx, attempt, settings);
			}),
		saveQuizAnswer: (
			_p: unknown,
			args: {
				slug: string;
				attemptId: string;
				questionId: string;
				answer: string;
			},
			ctx: Ctx,
		) =>
			asMember(ctx, args.slug, async (tx, org, userId) => {
				const attempt = await ownAttempt(tx, userId, args.attemptId);
				const { settings } = await visibleQuiz(tx, org, userId, attempt.quizId);
				if (attempt.submittedAt)
					return refuse("This attempt is already handed in.", "FORBIDDEN");
				if (timeUp(attempt, GRACE_MS))
					return refuse("Time's up for this attempt.", "FORBIDDEN");
				if (!attempt.questionIds.includes(args.questionId))
					return refuse(
						"That question isn't in this attempt.",
						"BAD_USER_INPUT",
					);
				const checkEach = settings.showAnswers === "after_each";
				if (checkEach && args.questionId in attempt.answers)
					return refuse("You've already answered this one.", "FORBIDDEN");
				let answer: unknown;
				try {
					answer = questionAnswer.parse(JSON.parse(args.answer));
				} catch {
					return refuse("That answer can't be read.", "BAD_USER_INPUT");
				}
				await tx
					.update(quizAttempt)
					.set({ answers: { ...attempt.answers, [args.questionId]: answer } })
					.where(eq(quizAttempt.id, attempt.id));
				if (!checkEach) return { saved: true };
				const [q] = await tx
					.select()
					.from(quizQuestion)
					.where(eq(quizQuestion.id, args.questionId));
				const p = q?.payload as QuestionPayload | undefined;
				return {
					saved: true,
					correct: p ? isCorrect(p, answer) : false,
					correctAnswer: p ? correctAnswerOf(p) : null,
					explanation: q?.explanation ?? null,
				};
			}),
		submitQuizAttempt: (
			_p: unknown,
			{ slug, attemptId }: { slug: string; attemptId: string },
			ctx: Ctx,
		) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const attempt = await ownAttempt(tx, userId, attemptId);
				const { settings } = await visibleQuiz(tx, org, userId, attempt.quizId);
				if (attempt.submittedAt) return attemptView(tx, attempt, settings);
				return attemptView(
					tx,
					await grade(tx, attempt, settings, timeUp(attempt)),
					settings,
				);
			}),
	},
};
