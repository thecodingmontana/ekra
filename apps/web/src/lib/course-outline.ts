import type { Course, Lesson } from "../graphql/course.ts";

/** Every lesson of a course in the order learners take them. */
export const allLessons = (course: Pick<Course, "sections">): Lesson[] =>
	course.sections.flatMap((s) => s.lessons);

/** The lesson after (or before, with -1) this one, across sections; null at either end. */
export function neighbor(
	course: Pick<Course, "sections">,
	lessonId: string,
	step: 1 | -1 = 1,
): Lesson | null {
	const list = allLessons(course);
	const at = list.findIndex((l) => l.id === lessonId);
	if (at < 0) return null;
	return list[at + step] ?? null;
}

/** Where to start or continue: the first lesson not done yet (the first one when all are done). */
export function resumeLesson(course: Pick<Course, "sections">): Lesson | null {
	const list = allLessons(course);
	return list.find((l) => !l.completed) ?? list[0] ?? null;
}

/** "Section 2 · Lesson 1 of 4" for a lesson, or null when it isn't in the course. */
export function lessonPlace(
	course: Pick<Course, "sections">,
	lessonId: string,
) {
	for (const [s, section] of course.sections.entries()) {
		const i = section.lessons.findIndex((l) => l.id === lessonId);
		if (i >= 0)
			return {
				section: s + 1,
				sectionTitle: section.title,
				lesson: i + 1,
				of: section.lessons.length,
			};
	}
	return null;
}

/**
 * The outline narrowed to lessons whose title (or section title) contains the query; sections with nothing
 * left are dropped. An empty query keeps everything.
 */
export function searchOutline<C extends Pick<Course, "sections">>(
	course: C,
	query: string,
): C["sections"] {
	const q = query.trim().toLowerCase();
	if (!q) return course.sections;
	return course.sections.flatMap((s) => {
		if (s.title.toLowerCase().includes(q)) return [s];
		const lessons = s.lessons.filter((l) => l.title.toLowerCase().includes(q));
		return lessons.length ? [{ ...s, lessons }] : [];
	});
}

/**
 * The position to send to moveLesson so `movingId` lands just before `beforeId` in a section whose lessons
 * are `ids` (null: at the end). The server counts positions without the moving lesson.
 */
export function dropPosition(
	ids: string[],
	movingId: string,
	beforeId: string | null,
): number {
	const others = ids.filter((id) => id !== movingId);
	if (beforeId === null) return others.length;
	const at = others.indexOf(beforeId);
	return at < 0 ? others.length : at;
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function clock(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const ss = String(s % 60).padStart(2, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Where "Move up" / "Move down" sends a lesson: one place within its section, or across into the end of the
 * previous section / the start of the next one. Null when it can't go further.
 */
export function stepTarget(
	course: Pick<Course, "sections">,
	lessonId: string,
	dir: 1 | -1,
): { sectionId: string; position: number } | null {
	const si = course.sections.findIndex((s) =>
		s.lessons.some((l) => l.id === lessonId),
	);
	const section = course.sections[si];
	if (!section) return null;
	const li = section.lessons.findIndex((l) => l.id === lessonId);
	const inside = li + dir;
	if (inside >= 0 && inside < section.lessons.length)
		return { sectionId: section.id, position: inside };
	const other = course.sections[si + dir];
	if (!other) return null;
	return {
		sectionId: other.id,
		position: dir === 1 ? 0 : other.lessons.length,
	};
}
