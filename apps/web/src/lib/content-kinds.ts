import type { ContentKind } from "@/graphql/library";

/** How each kind of content is named and drawn, in the order the library's tabs show them. */
export const KINDS: Record<
	ContentKind,
	{ label: string; plural: string; icon: string; tint: string; lead: string }
> = {
	folder: {
		label: "Folder",
		plural: "Folders",
		icon: "icon-[solar--folder-linear]",
		tint: "text-tint-amber bg-tint-amber/13",
		lead: "Group content to keep the library tidy.",
	},
	page: {
		label: "Page",
		plural: "Pages",
		icon: "icon-[solar--document-text-linear]",
		tint: "text-tint-blue bg-tint-blue/13",
		lead: "A single page of reading: a guide, a policy, a handout.",
	},
	course: {
		label: "Course",
		plural: "Courses",
		icon: "icon-[solar--square-academic-cap-linear]",
		tint: "text-tint-violet bg-tint-violet/13",
		lead: "Lessons in order, with video, reading and quizzes.",
	},
	quiz: {
		label: "Quiz",
		plural: "Quizzes",
		icon: "icon-[solar--checklist-minimalistic-linear]",
		tint: "text-tint-orange bg-tint-orange/13",
		lead: "Questions that check what people learned.",
	},
	assignment: {
		label: "Assignment",
		plural: "Assignments",
		icon: "icon-[solar--clipboard-check-linear]",
		tint: "text-tint-red bg-tint-red/13",
		lead: "Work people hand in for review.",
	},
	path: {
		label: "Learning path",
		plural: "Learning paths",
		icon: "icon-[solar--routing-2-linear]",
		tint: "text-tint-green bg-tint-green/13",
		lead: "Courses and content to take one after another.",
	},
	wiki: {
		label: "Wiki",
		plural: "Wikis",
		icon: "icon-[solar--notebook-linear]",
		tint: "text-tint-teal bg-tint-teal/13",
		lead: "Reference pages your team keeps up to date.",
	},
};

export const KIND_ORDER = Object.keys(KINDS) as ContentKind[];
