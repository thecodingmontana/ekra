import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContentItem } from "../graphql/library.ts";
import { filterLibrary, type LibraryView } from "./library-filter.ts";

let n = 0;
const item = (fields: Partial<ContentItem>): ContentItem => {
	n += 1;
	return {
		id: `i${n}`,
		kind: "page",
		title: `Item ${n}`,
		description: null,
		status: "draft",
		isTemplate: false,
		parentId: null,
		archivedAt: null,
		createdAt: `2026-01-${String(n).padStart(2, "0")}T00:00:00Z`,
		updatedAt: `2026-01-${String(n).padStart(2, "0")}T00:00:00Z`,
		author: null,
		isFavorite: false,
		viewedAt: null,
		...fields,
	};
};

const folder = item({
	kind: "folder",
	title: "Onboarding",
	status: "published",
});
const inner = item({ kind: "folder", title: "Week one", parentId: folder.id });
const course = item({
	kind: "course",
	title: "Customer service",
	status: "published",
	parentId: folder.id,
	isFavorite: true,
});
const page = item({
	title: "Code of conduct",
	viewedAt: "2026-02-01T00:00:00Z",
});
const template = item({ kind: "course", title: "Safety", isTemplate: true });
const orphan = item({ title: "In a hidden folder", parentId: "gone" });
const items = [folder, inner, course, page, template, orphan];

const view = (v: Partial<LibraryView> = {}): LibraryView => ({
	kind: "all",
	show: "all",
	status: "all",
	sort: "updated",
	q: "",
	...v,
});
const titles = (v: Partial<LibraryView>) =>
	filterLibrary(items, items, view(v)).shown.map((i) => i.title);

test("the top of the library: folders first, then the newest", () => {
	assert.deepEqual(titles({}), [
		"Onboarding",
		"In a hidden folder",
		"Safety",
		"Code of conduct",
	]);
});

test("inside a folder: its content, with breadcrumbs", () => {
	const r = filterLibrary(items, items, view({ folder: inner.id }));
	assert.deepEqual(
		r.crumbs.map((c) => c.title),
		["Onboarding", "Week one"],
	);
	assert.deepEqual(titles({ folder: folder.id }), [
		"Week one",
		"Customer service",
	]);
	// a folder that doesn't exist shows the top
	assert.equal(titles({ folder: "nope" }).length, 4);
});

test("a kind tab, a status or a search lists matches from every folder", () => {
	assert.deepEqual(titles({ kind: "course" }), ["Safety", "Customer service"]);
	assert.deepEqual(titles({ status: "published" }), ["Customer service"]);
	assert.ok(
		!titles({ status: "draft" }).includes("Onboarding"),
		"folders have no status",
	);
	assert.deepEqual(titles({ q: "CUSTOMER" }), ["Customer service"]);
	assert.deepEqual(titles({ q: "service", folder: inner.id }), [
		"Customer service",
	]);
});

test("favorites, recent and templates", () => {
	assert.deepEqual(titles({ show: "favorites" }), ["Customer service"]);
	assert.deepEqual(titles({ show: "recent" }), ["Code of conduct"]);
	assert.deepEqual(titles({ show: "templates" }), ["Safety"]);
});

test("tab counts are totals across folders", () => {
	const { counts } = filterLibrary(items, items, view({ folder: folder.id }));
	assert.equal(counts.get("all"), 6);
	assert.equal(counts.get("course"), 2);
	assert.equal(counts.get("quiz"), undefined);
});

test("sort by name goes A to Z", () => {
	assert.deepEqual(titles({ sort: "title", kind: "page" }), [
		"Code of conduct",
		"In a hidden folder",
	]);
});
