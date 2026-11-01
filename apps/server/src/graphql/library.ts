import {
	contentFavorite,
	contentItem,
	contentView,
	type Tx,
	user,
	withOrg,
} from "@ekra/db";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { z } from "zod";
import { type Role, roles } from "../auth/permissions.ts";
import { db } from "../db.ts";
import { type ActiveOrg, orgBySlug } from "./tenant.ts";

/**
 * An organization's learning content (the library). Every read and write runs through withOrg, so Postgres
 * row-level security only lets this organization's rows through. Owners, admins and trainers manage content;
 * learners and guests see what's published, never drafts or templates.
 */
export const libraryTypeDefs = /* GraphQL */ `
	extend type Query {
		"The organization's library: everything you can see, newest first. Archived content only when asked for."
		library(slug: String!, archived: Boolean = false): Library!
		"One piece of content, or null when it doesn't exist or you can't see it."
		content(slug: String!, id: ID!): ContentItem
	}

	type Mutation {
		createContent(slug: String!, input: CreateContentInput!): ContentItem!
		updateContent(slug: String!, id: ID!, input: UpdateContentInput!): ContentItem!
		"Archive (true) or restore (false). Archived content leaves the library but isn't deleted."
		archiveContent(slug: String!, id: ID!, archived: Boolean!): ContentItem!
		"Delete archived content for good."
		deleteContent(slug: String!, id: ID!): Boolean!
		"A copy to work on; from a template it's a new draft with the template's name."
		duplicateContent(slug: String!, id: ID!): ContentItem!
		"Star or unstar content for yourself."
		favoriteContent(slug: String!, id: ID!, favorite: Boolean!): ContentItem!
		"Note that you opened it, for the Recent view."
		viewContent(slug: String!, id: ID!): Boolean!
	}

	type Library {
		"You can create, edit, publish and archive content here."
		canManage: Boolean!
		items: [ContentItem!]!
	}

	enum ContentKind {
		folder
		page
		course
		quiz
		assignment
		path
		wiki
	}

	enum ContentStatus {
		draft
		published
	}

	type ContentItem {
		id: ID!
		kind: ContentKind!
		title: String!
		description: String
		status: ContentStatus!
		isTemplate: Boolean!
		"The folder it's in, or null at the top of the library."
		parentId: ID
		archivedAt: String
		createdAt: String!
		updatedAt: String!
		author: Author
		"You starred it."
		isFavorite: Boolean!
		"When you last opened it."
		viewedAt: String
	}

	type Author {
		id: ID!
		name: String!
		image: String
	}

	input CreateContentInput {
		kind: ContentKind!
		title: String!
		description: String
		parentId: ID
		isTemplate: Boolean
	}

	input UpdateContentInput {
		title: String
		description: String
		status: ContentStatus
		"Move into a folder; null moves it to the top."
		parentId: ID
		isTemplate: Boolean
	}
`;

const KINDS = [
	"folder",
	"page",
	"course",
	"quiz",
	"assignment",
	"path",
	"wiki",
] as const;
const title = z.string().trim().min(1, "Give it a title.").max(200);
const description = z.string().trim().max(2000).nullish();

const createInput = z.object({
	kind: z.enum(KINDS),
	title,
	description,
	parentId: z.string().max(32).nullish(),
	isTemplate: z.boolean().nullish(),
});

const updateInput = z.object({
	title: title.optional(),
	description,
	status: z.enum(["draft", "published"]).optional(),
	parentId: z.string().max(32).nullish(),
	isTemplate: z.boolean().optional(),
});

type Ctx = { session: { user: { id: string } } | null };
type Row = typeof contentItem.$inferSelect;

const refuse = (message: string, code = "FORBIDDEN"): never => {
	throw new GraphQLError(message, { extensions: { code } });
};

/** someone has several roles as "admin,trainer": any one of them may grant it */
const canManage = (role: string) =>
	role
		.split(",")
		.some(
			(r) =>
				roles[r.trim() as Role]?.authorize({ content: ["update"] }).success,
		);

/** what someone who can't manage content may see: published, not a template, not archived */
const visibleTo = (org: ActiveOrg) =>
	canManage(org.role)
		? undefined
		: and(
				eq(contentItem.status, "published"),
				eq(contentItem.isTemplate, false),
				isNull(contentItem.archivedAt),
			);

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
	const parsed = schema.safeParse(input);
	if (!parsed.success)
		return refuse(
			parsed.error.issues[0]?.message ?? "Check the details.",
			"BAD_USER_INPUT",
		);
	return parsed.data;
}

/** The content with what the library shows about it, for the signed-in person. */
function select(tx: Tx, userId: string) {
	return tx
		.select({
			item: contentItem,
			author: { id: user.id, name: user.name, image: user.image },
			favoritedAt: contentFavorite.createdAt,
			viewedAt: contentView.viewedAt,
		})
		.from(contentItem)
		.leftJoin(user, eq(user.id, contentItem.createdBy))
		.leftJoin(
			contentFavorite,
			and(
				eq(contentFavorite.contentId, contentItem.id),
				eq(contentFavorite.userId, userId),
			),
		)
		.leftJoin(
			contentView,
			and(
				eq(contentView.contentId, contentItem.id),
				eq(contentView.userId, userId),
			),
		);
}

type Selected = Awaited<ReturnType<ReturnType<typeof select>["execute"]>>[0];

const toGraphQL = ({ item, author, favoritedAt, viewedAt }: Selected) => ({
	...item,
	archivedAt: item.archivedAt?.toISOString() ?? null,
	createdAt: item.createdAt.toISOString(),
	updatedAt: item.updatedAt.toISOString(),
	author: author?.id ? author : null,
	isFavorite: !!favoritedAt,
	viewedAt: viewedAt?.toISOString() ?? null,
});

/** One piece of content the person may see, or null. */
async function findOne(tx: Tx, org: ActiveOrg, userId: string, id: string) {
	const [row] = await select(tx, userId)
		.where(and(eq(contentItem.id, id), visibleTo(org)))
		.limit(1);
	return row ?? null;
}

async function mustFind(tx: Tx, org: ActiveOrg, userId: string, id: string) {
	return (
		(await findOne(tx, org, userId, id)) ??
		refuse("That content doesn't exist or was deleted.", "NOT_FOUND")
	);
}

/** A folder to put content in: in this organization, not archived, and not the item itself or inside it. */
async function checkFolder(tx: Tx, folderId: string, movingId?: string) {
	let at: string | null = folderId;
	for (let depth = 0; at; depth++) {
		if (at === movingId || depth > 50)
			refuse("A folder can't go inside itself.", "BAD_USER_INPUT");
		const [folder]: Pick<Row, "kind" | "parentId" | "archivedAt">[] = await tx
			.select({
				kind: contentItem.kind,
				parentId: contentItem.parentId,
				archivedAt: contentItem.archivedAt,
			})
			.from(contentItem)
			.where(eq(contentItem.id, at));
		if (!folder || folder.kind !== "folder" || folder.archivedAt)
			refuse("Pick a folder from this library.", "BAD_USER_INPUT");
		at = folder?.parentId ?? null;
	}
}

/** Resolve the organization and the person, check they may manage content, and run `work` under RLS. */
async function manage<T>(
	ctx: Ctx,
	slug: string,
	work: (tx: Tx, org: ActiveOrg, userId: string) => Promise<T>,
) {
	const org = await orgBySlug(ctx, slug);
	if (!canManage(org.role))
		refuse("Only owners, admins and trainers can change content.");
	return withOrg(db, org.id, (tx) => work(tx, org, ctx.session?.user.id ?? ""));
}

/** Same, for anything a member who can see the content may do. */
async function asMember<T>(
	ctx: Ctx,
	slug: string,
	work: (tx: Tx, org: ActiveOrg, userId: string) => Promise<T>,
) {
	const org = await orgBySlug(ctx, slug);
	return withOrg(db, org.id, (tx) => work(tx, org, ctx.session?.user.id ?? ""));
}

type SlugId = { slug: string; id: string };

export const libraryResolvers = {
	Query: {
		library: (
			_parent: unknown,
			{ slug, archived }: { slug: string; archived: boolean },
			ctx: Ctx,
		) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				if (archived && !canManage(org.role))
					return { canManage: false, items: [] };
				// shortcut: the newest 1000 items in one list, filtered in the browser; page it when a library grows past that
				const rows = await select(tx, userId)
					.where(
						and(
							archived
								? isNotNull(contentItem.archivedAt)
								: isNull(contentItem.archivedAt),
							visibleTo(org),
						),
					)
					.orderBy(desc(contentItem.updatedAt))
					.limit(1000);
				return { canManage: canManage(org.role), items: rows.map(toGraphQL) };
			}),
		content: (_parent: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const row = await findOne(tx, org, userId, id);
				return row ? toGraphQL(row) : null;
			}),
	},
	Mutation: {
		createContent: (
			_parent: unknown,
			{ slug, input }: { slug: string; input: unknown },
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx, org, userId) => {
				const data = parse(createInput, input);
				if (data.parentId) await checkFolder(tx, data.parentId);
				const [created] = await tx
					.insert(contentItem)
					.values({
						...data,
						isTemplate: data.kind !== "folder" && !!data.isTemplate,
						// a folder only groups content: learners see it as soon as it exists
						status: data.kind === "folder" ? "published" : "draft",
						orgId: org.id,
						createdBy: userId,
					})
					.returning({ id: contentItem.id });
				return toGraphQL(await mustFind(tx, org, userId, created?.id ?? ""));
			}),
		updateContent: (
			_parent: unknown,
			{ slug, id, input }: SlugId & { input: unknown },
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx, org, userId) => {
				const data = parse(updateInput, input);
				const { item } = await mustFind(tx, org, userId, id);
				if (data.parentId) await checkFolder(tx, data.parentId, id);
				if (item.kind === "folder") {
					data.isTemplate = false;
					data.status = undefined;
				}
				await tx.update(contentItem).set(data).where(eq(contentItem.id, id));
				return toGraphQL(await mustFind(tx, org, userId, id));
			}),
		archiveContent: (
			_parent: unknown,
			{ slug, id, archived }: SlugId & { archived: boolean },
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx, org, userId) => {
				await mustFind(tx, org, userId, id);
				await tx
					.update(contentItem)
					.set({ archivedAt: archived ? new Date() : null })
					.where(eq(contentItem.id, id));
				return toGraphQL(await mustFind(tx, org, userId, id));
			}),
		deleteContent: (_parent: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx, org, userId) => {
				const { item } = await mustFind(tx, org, userId, id);
				if (!item.archivedAt)
					refuse("Archive it first; only archived content can be deleted.");
				await tx.delete(contentItem).where(eq(contentItem.id, id));
				return true;
			}),
		duplicateContent: (_parent: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx, org, userId) => {
				const { item } = await mustFind(tx, org, userId, id);
				if (item.kind === "folder")
					refuse("Folders can't be copied yet.", "BAD_USER_INPUT");
				const [copy] = await tx
					.insert(contentItem)
					.values({
						orgId: org.id,
						kind: item.kind,
						title: item.isTemplate
							? item.title
							: `Copy of ${item.title}`.slice(0, 200),
						description: item.description,
						parentId: item.isTemplate ? null : item.parentId,
						createdBy: userId,
					})
					.returning({ id: contentItem.id });
				return toGraphQL(await mustFind(tx, org, userId, copy?.id ?? ""));
			}),
		favoriteContent: (
			_parent: unknown,
			{ slug, id, favorite }: SlugId & { favorite: boolean },
			ctx: Ctx,
		) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				await mustFind(tx, org, userId, id);
				if (favorite)
					await tx
						.insert(contentFavorite)
						.values({ orgId: org.id, userId, contentId: id })
						.onConflictDoNothing();
				else
					await tx
						.delete(contentFavorite)
						.where(
							and(
								eq(contentFavorite.userId, userId),
								eq(contentFavorite.contentId, id),
							),
						);
				return toGraphQL(await mustFind(tx, org, userId, id));
			}),
		viewContent: (_parent: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				if (!(await findOne(tx, org, userId, id))) return false;
				await tx
					.insert(contentView)
					.values({ orgId: org.id, userId, contentId: id })
					.onConflictDoUpdate({
						target: [contentView.userId, contentView.contentId],
						set: { viewedAt: sql`now()` },
					});
				return true;
			}),
	},
};
