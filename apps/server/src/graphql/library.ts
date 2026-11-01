import { checkDoc, DocError } from "@ekra/core";
import {
	contentFavorite,
	contentItem,
	contentVersion,
	contentView,
	type Tx,
	user,
	withOrg,
} from "@ekra/db";
import {
	and,
	desc,
	eq,
	getColumns,
	gt,
	isNotNull,
	isNull,
	sql,
} from "drizzle-orm";
import { GraphQLError } from "graphql";
import { z } from "zod";
import { canManageContent } from "../auth/permissions.ts";
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
		"Earlier states of a body, newest first (owners, admins and trainers)."
		contentVersions(slug: String!, id: ID!): [ContentVersion!]!
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
		"Save the body (Tiptap JSON as text). Refused (CONFLICT) when someone saved a newer body since baseBodyUpdatedAt."
		saveContentBody(
			slug: String!
			id: ID!
			doc: String!
			baseBodyUpdatedAt: String
		): ContentItem!
		"Put an earlier version's body back; the history keeps what was there."
		restoreContentVersion(slug: String!, id: ID!, versionId: ID!): ContentItem!
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
		"The body as Tiptap JSON text, or null when nothing's written yet."
		doc: String
		"When the body last changed (send it back when saving)."
		bodyUpdatedAt: String
	}

	type ContentVersion {
		id: ID!
		title: String!
		"The body as plain text, for the history's what-changed view."
		bodyText: String!
		author: Author
		createdAt: String!
		updatedAt: String!
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

/** what someone who can't manage content may see: published, not a template, not archived */
const visibleTo = (org: ActiveOrg) =>
	canManageContent(org.role)
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

// lists never load bodies; the doc field fetches one when it's asked for
const {
	doc: _doc,
	bodyText: _bodyText,
	...listColumns
} = getColumns(contentItem);

/** The content with what the library shows about it, for the signed-in person. */
function select(tx: Tx, userId: string) {
	return tx
		.select({
			item: listColumns,
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
	bodyUpdatedAt: item.bodyUpdatedAt?.toISOString() ?? null,
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
		if (folder?.kind !== "folder" || folder.archivedAt)
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
	if (!canManageContent(org.role))
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

/** saves by the same person within this long fold into one version */
const VERSION_SITTING_MS = 10 * 60_000;

/** The body as checked Tiptap JSON and plain text, or a BAD_USER_INPUT refusal that says why. */
function cleanBody(doc: string) {
	try {
		return checkDoc(JSON.parse(doc));
	} catch (error) {
		if (error instanceof DocError || error instanceof SyntaxError)
			return refuse(
				error instanceof DocError ? error.message : "Bad page content",
				"BAD_USER_INPUT",
			);
		throw error;
	}
}

/** Puts a body on content and into its history (a new version, or the author's current sitting). */
async function writeBody(
	tx: Tx,
	org: ActiveOrg,
	userId: string,
	id: string,
	body: { doc: unknown; text: string },
	fold: boolean,
) {
	const now = new Date();
	const [item] = await tx
		.update(contentItem)
		.set({ doc: body.doc, bodyText: body.text, bodyUpdatedAt: now })
		.where(eq(contentItem.id, id))
		.returning({ title: contentItem.title });
	const [sitting] = fold
		? await tx
				.select({ id: contentVersion.id })
				.from(contentVersion)
				.where(
					and(
						eq(contentVersion.contentId, id),
						eq(contentVersion.authorId, userId),
						gt(
							contentVersion.updatedAt,
							new Date(now.getTime() - VERSION_SITTING_MS),
						),
					),
				)
				.orderBy(desc(contentVersion.updatedAt))
				.limit(1)
		: [];
	const version = {
		title: item?.title ?? "",
		doc: body.doc,
		bodyText: body.text,
	};
	if (sitting)
		await tx
			.update(contentVersion)
			.set(version)
			.where(eq(contentVersion.id, sitting.id));
	else
		await tx.insert(contentVersion).values({
			...version,
			orgId: org.id,
			contentId: id,
			authorId: userId,
		});
}

export const libraryResolvers = {
	Query: {
		library: (
			_parent: unknown,
			{ slug, archived }: { slug: string; archived: boolean },
			ctx: Ctx,
		) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				if (archived && !canManageContent(org.role))
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
				return {
					canManage: canManageContent(org.role),
					items: rows.map(toGraphQL),
				};
			}),
		content: (_parent: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const row = await findOne(tx, org, userId, id);
				return row ? toGraphQL(row) : null;
			}),
		contentVersions: (_parent: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx) => {
				const rows = await tx
					.select({
						version: contentVersion,
						author: { id: user.id, name: user.name, image: user.image },
					})
					.from(contentVersion)
					.leftJoin(user, eq(user.id, contentVersion.authorId))
					.where(eq(contentVersion.contentId, id))
					.orderBy(desc(contentVersion.updatedAt))
					.limit(100);
				return rows.map(({ version, author }) => ({
					...version,
					author: author?.id ? author : null,
					createdAt: version.createdAt.toISOString(),
					updatedAt: version.updatedAt.toISOString(),
				}));
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
				if (data.parentId) {
					// one move at a time per organization: two crossing moves could each pass the check and loop
					await tx.execute(
						sql`select pg_advisory_xact_lock(hashtext(${org.id}))`,
					);
					await checkFolder(tx, data.parentId, id);
				}
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
				const [body] = await tx
					.select({ doc: contentItem.doc, bodyText: contentItem.bodyText })
					.from(contentItem)
					.where(eq(contentItem.id, id));
				const [copy] = await tx
					.insert(contentItem)
					.values({
						orgId: org.id,
						kind: item.kind,
						title: item.isTemplate
							? item.title
							: `Copy of ${item.title}`.slice(0, 200),
						description: item.description,
						doc: body?.doc ?? null,
						bodyText: body?.bodyText ?? null,
						bodyUpdatedAt: body?.doc ? new Date() : null,
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
		saveContentBody: (
			_parent: unknown,
			{
				slug,
				id,
				doc,
				baseBodyUpdatedAt,
			}: SlugId & { doc: string; baseBodyUpdatedAt?: string | null },
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx, org, userId) => {
				const body = cleanBody(doc);
				// locked until this save commits, so two saves can't both pass the check below
				const [current] = await tx
					.select({
						kind: contentItem.kind,
						bodyUpdatedAt: contentItem.bodyUpdatedAt,
					})
					.from(contentItem)
					.where(eq(contentItem.id, id))
					.for("update");
				if (!current)
					refuse("That content doesn't exist or was deleted.", "NOT_FOUND");
				if (current?.kind === "folder")
					refuse("Folders don't have a page.", "BAD_USER_INPUT");
				if (
					(current?.bodyUpdatedAt?.toISOString() ?? null) !==
					(baseBodyUpdatedAt ?? null)
				)
					refuse(
						"Someone else changed this page since you opened it.",
						"CONFLICT",
					);
				await writeBody(tx, org, userId, id, body, true);
				return toGraphQL(await mustFind(tx, org, userId, id));
			}),
		restoreContentVersion: (
			_parent: unknown,
			{ slug, id, versionId }: SlugId & { versionId: string },
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx, org, userId) => {
				const [version] = await tx
					.select({ doc: contentVersion.doc, text: contentVersion.bodyText })
					.from(contentVersion)
					.where(
						and(
							eq(contentVersion.id, versionId),
							eq(contentVersion.contentId, id),
						),
					);
				if (!version) refuse("That version doesn't exist.", "NOT_FOUND");
				await tx
					.select({ id: contentItem.id })
					.from(contentItem)
					.where(eq(contentItem.id, id))
					.for("update");
				await writeBody(
					tx,
					org,
					userId,
					id,
					{ doc: version?.doc, text: version?.text ?? "" },
					false,
				);
				return toGraphQL(await mustFind(tx, org, userId, id));
			}),
	},
	ContentItem: {
		// asked for on one item at a time (the content page): the parent resolver already checked it's visible
		doc: async (item: { id: string; orgId: string }) => {
			const [row] = await withOrg(db, item.orgId, (tx) =>
				tx
					.select({ doc: contentItem.doc })
					.from(contentItem)
					.where(eq(contentItem.id, item.id)),
			);
			return row?.doc ? JSON.stringify(row.doc) : null;
		},
	},
};
