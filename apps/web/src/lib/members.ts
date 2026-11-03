/** The roles a member can have, most powerful first. */
export const ROLES = ["owner", "admin", "trainer", "learner", "guest"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
	owner: "Owner",
	admin: "Admin",
	trainer: "Trainer",
	learner: "Learner",
	guest: "Guest",
};

export const ROLE_HELP: Record<Role, string> = {
	owner: "Everything, including deleting the organization",
	admin: "Runs members, teams, settings and content",
	trainer: "Builds courses, assigns learning, sees reports",
	learner: "Takes the learning given or open to them",
	guest: "Only sees what's shared with them",
};

/** A role as stored ("admin" or "admin,trainer"), split into its parts. */
export const rolesOf = (role: string) => role.split(",").map((r) => r.trim());

/** The first known role in a stored role, for showing it. */
export const mainRole = (role: string): Role =>
	ROLES.find((r) => rolesOf(role).includes(r)) ?? "learner";

const isOwner = (role: string) => rolesOf(role).includes("owner");

/** Owners and admins manage members and invitations. */
export const canManageMembers = (role: string) =>
	isOwner(role) || rolesOf(role).includes("admin");

/** Owners, admins and trainers manage content and see reports; one of several roles is enough. */
export const canManageContent = (role: string) =>
	rolesOf(role).some((r) => r === "owner" || r === "admin" || r === "trainer");

/** The roles you may give someone: only owners make owners. */
export const assignableRoles = (viewerRole: string): readonly Role[] =>
	isOwner(viewerRole) ? ROLES : ROLES.filter((r) => r !== "owner");

/**
 * Whether you may change this member's role or remove them: owners and admins may, never for themselves, never
 * for the last owner, and admins never for an owner.
 */
export function canManageMember({
	viewer,
	member,
	owners,
}: {
	viewer: { userId: string; role: string };
	member: { userId: string; role: string };
	owners: number;
}): boolean {
	if (!canManageMembers(viewer.role)) return false;
	if (member.userId === viewer.userId) return false;
	if (!isOwner(member.role)) return true;
	return isOwner(viewer.role) && owners > 1;
}
