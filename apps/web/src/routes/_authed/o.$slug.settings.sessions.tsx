import { Button } from "@ekra/ui/components/button";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { SettingsHeader, SRow } from "@/components/settings-ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/o/$slug/settings/sessions")({
	head: () => ({ meta: [{ title: "Sessions · Ekra" }] }),
	component: Sessions,
});

type Session = {
	id: string;
	token: string;
	userAgent?: string | null;
	ipAddress?: string | null;
	updatedAt: string | Date;
};

const BROWSERS: [RegExp, string, string][] = [
	[/Edg(e|A|iOS)?\//, "Edge", "icon-[solar--global-linear]"],
	[/OPR\/|Opera/, "Opera", "icon-[devicon--opera]"],
	[/Firefox\/|FxiOS\//, "Firefox", "icon-[devicon--firefox]"],
	[/Chrome\/|CriOS\//, "Chrome", "icon-[devicon--chrome]"],
	[/Safari\//, "Safari", "icon-[devicon--safari]"],
];

/** "Chrome on macOS" and the browser's logo, from a user agent string. */
export function describeDevice(ua: string | null | undefined) {
	const [, browser, icon] = BROWSERS.find(([re]) => re.test(ua ?? "")) ?? [
		null,
		ua ? "Browser" : "Unknown device",
		/iPhone|iPad|Android|Mobile/.test(ua ?? "")
			? "icon-[solar--smartphone-linear]"
			: "icon-[solar--monitor-linear]",
	];
	const os = !ua
		? ""
		: /iPhone|iPad/.test(ua)
			? "iOS"
			: /Android/.test(ua)
				? "Android"
				: /Mac OS X/.test(ua)
					? "macOS"
					: /Windows/.test(ua)
						? "Windows"
						: /Linux/.test(ua)
							? "Linux"
							: "";
	return { label: os ? `${browser} on ${os}` : browser, icon };
}

/** "just now", "5m ago", "3h ago", "2d ago", then the date. */
function ago(when: string | Date) {
	const minutes = Math.floor((Date.now() - new Date(when).getTime()) / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
	if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
	return new Date(when).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function Sessions() {
	const { data: current } = authClient.useSession();
	const [sessions, setSessions] = useState<Session[] | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);

	const load = useCallback(async () => {
		const { data, error } = await authClient.listSessions();
		if (error) toast.error(authErrorMessage(error));
		setSessions((data as Session[] | null) ?? []);
	}, []);
	useEffect(() => {
		void load();
	}, [load]);

	const currentId = current?.session.id;
	const sorted = [...(sessions ?? [])].sort(
		(a, b) => Number(b.id === currentId) - Number(a.id === currentId),
	);

	async function signOutOne(session: Session) {
		setBusy(session.id);
		const { error } = await authClient.revokeSession({ token: session.token });
		setBusy(null);
		if (error) return void toast.error(authErrorMessage(error));
		toast.success("Session signed out");
		await load();
	}

	async function signOutOthers() {
		setBusy("others");
		const { error } = await authClient.revokeOtherSessions();
		setBusy(null);
		setConfirming(false);
		if (error) return void toast.error(authErrorMessage(error));
		toast.success("Signed out of all other sessions");
		await load();
	}

	return (
		<>
			<SettingsHeader
				title="Sessions"
				lead="Devices currently signed in to your account."
			/>
			{sessions === null ? (
				<div className="flex items-center gap-2 border-b py-3.5 text-muted-foreground text-sm">
					<Spinner className="size-3.5" /> Loading…
				</div>
			) : (
				sorted.map((s) => {
					const mine = s.id === currentId;
					const device = describeDevice(s.userAgent);
					return (
						<SRow
							key={s.id}
							t={
								<span className="flex items-center gap-2">
									<span
										aria-hidden
										className={cn(device.icon, "size-4 shrink-0")}
									/>
									{device.label}
									{mine && (
										<span className="rounded-full bg-brand/15 px-1.5 py-px font-medium text-[11px] text-emerald-700 dark:text-emerald-300">
											This device
										</span>
									)}
								</span>
							}
							d={`${s.ipAddress || "Unknown location"} · ${mine ? "Active now" : ago(s.updatedAt)}`}
						>
							{!mine && (
								<Button
									variant="outline"
									size="sm"
									disabled={!!busy}
									aria-busy={busy === s.id}
									onClick={() => signOutOne(s)}
								>
									{busy === s.id && <Spinner />}
									Sign out
								</Button>
							)}
						</SRow>
					);
				})
			)}
			<div className="mt-4 flex items-center gap-2">
				{confirming ? (
					<>
						<Button
							variant="destructive"
							disabled={busy === "others"}
							aria-busy={busy === "others"}
							onClick={signOutOthers}
						>
							{busy === "others" && <Spinner />}
							Sign out others
						</Button>
						<Button variant="ghost" onClick={() => setConfirming(false)}>
							Cancel
						</Button>
						<span className="text-muted-foreground text-sm">
							Other devices will need to sign in again.
						</span>
					</>
				) : (
					<Button
						variant="ghost"
						className="text-destructive hover:text-destructive"
						disabled={sorted.length <= 1}
						onClick={() => setConfirming(true)}
					>
						Sign out of all other sessions
					</Button>
				)}
			</div>
		</>
	);
}
