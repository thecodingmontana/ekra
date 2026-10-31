import { gql } from "@apollo/client";

export type OrganizationKind = "company" | "creator";

export type Membership = {
	role: string;
	organization: {
		id: string;
		name: string;
		slug: string;
		kind: OrganizationKind;
		logo: string | null;
	};
};

export type Viewer = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	activeOrganizationId: string | null;
	memberships: Membership[];
};

/** Who is signed in, and the organizations they belong to. */
export const VIEWER = gql`
	query Viewer {
		viewer {
			id
			name
			email
			image
			activeOrganizationId
			memberships {
				role
				organization {
					id
					name
					slug
					kind
					logo
				}
			}
		}
	}
`;

export const SIGN_IN_METHODS = gql`
	query SignInMethods {
		signInMethods
	}
`;

/** Whether an organization address is free (onboarding checks it as you type). */
export const SLUG_AVAILABLE = gql`
	query SlugAvailable($slug: String!) {
		slugAvailable(slug: $slug)
	}
`;
