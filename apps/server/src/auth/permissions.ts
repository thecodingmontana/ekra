import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * What can be done in an organization. Better Auth's own statements cover the organization, members,
 * invitations and teams; Ekra adds learning content, assignments and reports.
 */
const statement = {
	...defaultStatements,
	content: ["create", "update", "delete", "publish"],
	assignment: ["create", "delete"],
	report: ["view"],
} as const;

export const ac = createAccessControl(statement);

const manageLearning = {
	content: ["create", "update", "delete", "publish"],
	assignment: ["create", "delete"],
	report: ["view"],
} as const;

/** The five roles a member can have. Whoever creates an organization becomes its owner. */
export const roles = {
	/** everything, including deleting the organization */
	owner: ac.newRole({ ...ownerAc.statements, ...manageLearning }),
	/** runs the organization: members, teams, settings, content */
	admin: ac.newRole({ ...adminAc.statements, ...manageLearning }),
	/** builds courses, assigns learning, sees reports */
	trainer: ac.newRole({ ...memberAc.statements, ...manageLearning }),
	/** takes the learning assigned or open to them */
	learner: ac.newRole({ ...memberAc.statements }),
	/** limited, view-only access to what's shared with them */
	guest: ac.newRole({}),
};

export type Role = keyof typeof roles;
