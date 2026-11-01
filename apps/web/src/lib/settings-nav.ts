/** The settings pages, in the groups the settings sidebar shows. Add a page here when it exists. */
export type SettingsItem = { to: string; label: string; icon: string };
export type SettingsGroup = {
	title: string;
	/** needs an organization to be in (hidden without one) */
	org?: boolean;
	items: SettingsItem[];
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
	{
		title: "Account",
		items: [
			{
				to: "/settings/profile",
				label: "Profile",
				icon: "icon-[solar--user-circle-linear]",
			},
			{
				to: "/settings/appearance",
				label: "Appearance",
				icon: "icon-[solar--pallete-2-linear]",
			},
			{
				to: "/settings/security",
				label: "Security",
				icon: "icon-[solar--shield-keyhole-linear]",
			},
			{
				to: "/settings/sessions",
				label: "Sessions",
				icon: "icon-[solar--devices-linear]",
			},
		],
	},
	{
		title: "Organization",
		org: true,
		items: [
			{
				to: "/settings/organization",
				label: "General",
				icon: "icon-[solar--buildings-2-linear]",
			},
		],
	},
];
