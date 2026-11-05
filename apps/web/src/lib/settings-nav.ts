import { canManageContent } from "./members.ts";

/** The settings pages, in the groups the settings sidebar shows; they live inside an organization's address (/o/acme/settings/…). Add a page here when it exists. */
export type SettingsPath =
	| "/o/$slug/settings/profile"
	| "/o/$slug/settings/appearance"
	| "/o/$slug/settings/security"
	| "/o/$slug/settings/sessions"
	| "/o/$slug/settings/ai"
	| "/o/$slug/settings/organization"
	| "/o/$slug/settings/members";
export type SettingsItem = {
	to: SettingsPath;
	label: string;
	icon: string;
	/** only for people who manage content (owners, admins, trainers) */
	managersOnly?: boolean;
};
export type SettingsGroup = {
	title: string;
	items: SettingsItem[];
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
	{
		title: "Account",
		items: [
			{
				to: "/o/$slug/settings/profile",
				label: "Profile",
				icon: "icon-[solar--user-circle-linear]",
			},
			{
				to: "/o/$slug/settings/appearance",
				label: "Appearance",
				icon: "icon-[solar--pallete-2-linear]",
			},
			{
				to: "/o/$slug/settings/security",
				label: "Security",
				icon: "icon-[solar--shield-keyhole-linear]",
			},
			{
				to: "/o/$slug/settings/sessions",
				label: "Sessions",
				icon: "icon-[solar--devices-linear]",
			},
			{
				to: "/o/$slug/settings/ai",
				label: "AI assistant",
				icon: "icon-[hugeicons--ai-magic]",
			},
		],
	},
	{
		title: "Organization",
		items: [
			{
				to: "/o/$slug/settings/organization",
				label: "General",
				icon: "icon-[solar--buildings-2-linear]",
			},
			{
				to: "/o/$slug/settings/members",
				label: "Members",
				icon: "icon-[solar--users-group-rounded-linear]",
				managersOnly: true,
			},
		],
	},
];

/** The settings pages this role may open. */
export const settingsGroupsFor = (role: string): SettingsGroup[] =>
	SETTINGS_GROUPS.map((g) => ({
		...g,
		items: g.items.filter((i) => !i.managersOnly || canManageContent(role)),
	}));
