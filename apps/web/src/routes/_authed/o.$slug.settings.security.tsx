import { ago, day } from "@ekra/core";
import { Button } from "@ekra/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@ekra/ui/components/field";
import { Input } from "@ekra/ui/components/input";
import { ConfirmModal } from "@ekra/ui/components/modal";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { SBlock, SettingsHeader } from "@/components/settings-ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/o/$slug/settings/security")({
	head: () => ({ meta: [{ title: "Security · Ekra" }] }),
	component: Security,
});

function Security() {
	return (
		<>
			<SettingsHeader
				title="Security"
				lead="Ways to keep your account yours."
			/>
			<AuthenticatorApp />
			<Passkeys />
			<ConnectedApps />
		</>
	);
}

function Section({
	title,
	description,
	first,
	children,
}: {
	title: string;
	description: string;
	first?: boolean;
	children: ReactNode;
}) {
	return (
		<SBlock title={title} first={first}>
			<p className="mb-3 text-muted-foreground text-sm">{description}</p>
			<div className="flex flex-col gap-4">{children}</div>
		</SBlock>
	);
}

/** Accounts with a password confirm it here; Google and email-link accounts have none, so the field only appears when asked. */
function usePasswordGate() {
	const [needed, setNeeded] = useState(false);
	const [password, setPassword] = useState("");
	const field = needed && (
		<Field>
			<FieldLabel htmlFor="confirm-password">Your password</FieldLabel>
			<Input
				id="confirm-password"
				type="password"
				autoComplete="current-password"
				placeholder="To confirm it's you"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
		</Field>
	);
	/** true when the error was "password needed": the field is now shown */
	const askedForPassword = (error: { message?: string }) => {
		if (needed || !/password/i.test(error.message ?? "")) return false;
		setNeeded(true);
		toast.info("Enter your password to continue");
		return true;
	};
	return { password: needed ? password : undefined, field, askedForPassword };
}

function AuthenticatorApp() {
	const { viewer } = Route.useRouteContext();
	const router = useRouter();
	const gate = usePasswordGate();
	const [busy, setBusy] = useState(false);
	const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(
		null,
	);
	const [code, setCode] = useState("");
	const [codes, setCodes] = useState<string[] | null>(null);

	async function start() {
		setBusy(true);
		const { data, error } = await authClient.twoFactor.enable({
			method: "totp",
			password: gate.password,
		});
		setBusy(false);
		if (error) {
			if (!gate.askedForPassword(error)) toast.error(authErrorMessage(error));
			return;
		}
		if (data.method === "totp")
			setSetup({ uri: data.totpURI, codes: data.backupCodes });
	}

	async function confirm() {
		setBusy(true);
		const { error } = await authClient.twoFactor.verifyTotp({ code });
		setBusy(false);
		if (error) return void toast.error(authErrorMessage(error));
		toast.success("Two-step sign-in is on");
		setCodes(setup?.codes ?? []);
		setSetup(null);
		setCode("");
		await router.invalidate();
	}

	async function turnOff() {
		setBusy(true);
		const { error } = await authClient.twoFactor.disable({
			password: gate.password,
		});
		setBusy(false);
		if (error) {
			if (!gate.askedForPassword(error)) toast.error(authErrorMessage(error));
			return;
		}
		toast.success("Two-step sign-in is off");
		await router.invalidate();
	}

	let body: ReactNode;
	if (codes) {
		body = (
			<>
				<p className="text-sm">
					Save these backup codes somewhere safe. Each one signs you in once if
					you lose your phone. You won't see them again.
				</p>
				<ul
					className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 font-mono text-sm"
					data-testid="backup-codes"
				>
					{codes.map((c) => (
						<li key={c}>{c}</li>
					))}
				</ul>
				<div className="flex gap-2">
					<Button
						variant="outline"
						onClick={() =>
							navigator.clipboard
								.writeText(codes.join("\n"))
								.then(() => toast.success("Backup codes copied"))
						}
					>
						<span className="icon-[solar--copy-linear] size-4" aria-hidden />
						Copy
					</Button>
					<Button onClick={() => setCodes(null)}>I saved them</Button>
				</div>
			</>
		);
	} else if (setup) {
		const secret = new URL(setup.uri).searchParams.get("secret");
		body = (
			<>
				<div className="flex flex-col items-start gap-4 sm:flex-row">
					<div className="rounded-lg bg-white p-2">
						<QRCodeSVG
							value={setup.uri}
							size={144}
							title="Scan with your authenticator app"
						/>
					</div>
					<ol className="flex list-decimal flex-col gap-2 pl-4 text-sm">
						<li>
							Scan the code with an authenticator app (Google Authenticator,
							1Password, Authy…).
						</li>
						<li>
							Can't scan? Enter this key:{" "}
							<code className="break-all rounded bg-muted px-1 font-mono text-xs">
								{secret}
							</code>
						</li>
						<li>Type the 6-digit code it shows.</li>
					</ol>
				</div>
				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						void confirm();
					}}
				>
					<Input
						aria-label="6-digit code"
						autoComplete="one-time-code"
						inputMode="numeric"
						maxLength={6}
						placeholder="123456"
						className="max-w-40 font-mono tracking-[0.2em]"
						value={code}
						onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
					/>
					<Button type="submit" disabled={busy || code.length !== 6}>
						{busy && <Spinner />}
						Turn on
					</Button>
					<Button type="button" variant="ghost" onClick={() => setSetup(null)}>
						Cancel
					</Button>
				</form>
			</>
		);
	} else {
		body = (
			<>
				{gate.field}
				<div className="flex items-center gap-3">
					<span
						className={`rounded-full px-2 py-0.5 font-medium text-xs ${viewer.twoFactorEnabled ? "bg-brand/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}
						data-testid="two-factor-status"
					>
						{viewer.twoFactorEnabled ? "On" : "Off"}
					</span>
					<span className="flex-1" />
					<Button
						variant={viewer.twoFactorEnabled ? "outline" : "default"}
						disabled={busy}
						aria-busy={busy}
						onClick={viewer.twoFactorEnabled ? turnOff : start}
					>
						{busy && <Spinner />}
						{viewer.twoFactorEnabled ? "Turn off" : "Set up"}
					</Button>
				</div>
			</>
		);
	}

	return (
		<Section
			first
			title="Authenticator app"
			description="After you sign in, also enter a code from an app on your phone."
		>
			{body}
		</Section>
	);
}

type Passkey = { id: string; name?: string | null; createdAt: Date | string };

function Passkeys() {
	const [list, setList] = useState<Passkey[] | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	// bumped after adding or removing one, to load the list again
	const [version, setVersion] = useState(0);
	useEffect(() => {
		void version;
		authClient.passkey
			.listUserPasskeys()
			.then(({ data }) => setList((data as Passkey[] | null) ?? []));
	}, [version]);
	const reload = () => setVersion((v) => v + 1);

	async function add() {
		setBusy("add");
		const result = await authClient.passkey.addPasskey();
		setBusy(null);
		// closing the browser's prompt isn't an error worth showing
		if (result?.error) {
			if (!/cancel|abort|not ?allowed/i.test(result.error.message ?? ""))
				toast.error(authErrorMessage(result.error));
			return;
		}
		toast.success("Passkey added");
		reload();
	}

	async function remove(id: string) {
		setBusy(id);
		const { error } = await authClient.passkey.deletePasskey({ id });
		setBusy(null);
		if (error) return void toast.error(authErrorMessage(error));
		toast.success("Passkey removed");
		reload();
	}

	return (
		<Section
			title="Passkeys"
			description="Sign in with your fingerprint, face or screen lock instead of a password."
		>
			{list === null ? (
				<FieldDescription className="flex items-center gap-2">
					<Spinner className="size-3" /> Loading…
				</FieldDescription>
			) : list.length === 0 ? (
				<FieldDescription>No passkeys yet.</FieldDescription>
			) : (
				<ul className="divide-y rounded-lg border" data-testid="passkeys">
					{list.map((p) => (
						<li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
							<span
								className="icon-[solar--key-minimalistic-linear] size-4 text-muted-foreground"
								aria-hidden
							/>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm">{p.name || "Passkey"}</div>
								<div className="text-muted-foreground text-xs">
									Added {day(p.createdAt)}
								</div>
							</div>
							<Button
								variant="ghost"
								size="sm"
								disabled={!!busy}
								aria-busy={busy === p.id}
								onClick={() => remove(p.id)}
							>
								{busy === p.id && <Spinner />}
								Remove
							</Button>
						</li>
					))}
				</ul>
			)}
			<div>
				<Button
					variant="outline"
					disabled={!!busy}
					aria-busy={busy === "add"}
					onClick={add}
				>
					{busy === "add" ? (
						<Spinner />
					) : (
						<span
							className="icon-[solar--add-circle-linear] size-4"
							aria-hidden
						/>
					)}
					Add a passkey
				</Button>
			</div>
		</Section>
	);
}

// the app's own address, not an organization's subdomain: agents' tokens are issued for this one
const MCP_ADDRESS = `${new URL(__APP_URL__).origin}/api/mcp`;

type ConnectedApp = { id: string; clientId: string; createdAt: string };

/** AI agents (Claude Code, Cursor…) you let use Ekra as you, through /api/mcp. */
function ConnectedApps() {
	const [apps, setApps] = useState<(ConnectedApp & { name: string })[] | null>(
		null,
	);
	const [leaving, setLeaving] = useState<
		(ConnectedApp & { name: string }) | null
	>(null);

	const load = useCallback(async () => {
		const res = await fetch("/api/auth/oauth2/get-consents");
		const list = res.ok ? ((await res.json()) as ConnectedApp[]) : [];
		// the name is whatever the app registered itself with
		const named = await Promise.all(
			list.map(async (app) => {
				const r = await fetch(
					`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(app.clientId)}`,
				);
				const info = r.ok ? ((await r.json()) as { client_name?: string }) : {};
				return { ...app, name: info.client_name?.trim() || "An app" };
			}),
		);
		setApps(named);
	}, []);
	useEffect(() => {
		void load();
	}, [load]);

	return (
		<Section
			title="Connected apps"
			description="AI agents you let use Ekra as you, with your role in each organization. Disconnecting stops one at once."
		>
			{apps === null ? (
				<FieldDescription className="flex items-center gap-2">
					<Spinner className="size-3" /> Loading…
				</FieldDescription>
			) : apps.length === 0 ? (
				<FieldDescription>No apps connected yet.</FieldDescription>
			) : (
				<ul className="divide-y rounded-lg border" data-testid="connected-apps">
					{apps.map((app) => (
						<li key={app.id} className="flex items-center gap-3 px-3 py-2.5">
							<span
								className="icon-[solar--plug-circle-linear] size-4 text-muted-foreground"
								aria-hidden
							/>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm">{app.name}</div>
								<div className="text-muted-foreground text-xs">
									Connected {ago(app.createdAt)}
								</div>
							</div>
							<Button variant="ghost" size="sm" onClick={() => setLeaving(app)}>
								Disconnect
							</Button>
						</li>
					))}
				</ul>
			)}
			<FieldDescription>
				To connect an agent, give it this address:{" "}
				<code className="rounded bg-muted px-1 py-0.5 text-foreground text-xs">
					{MCP_ADDRESS}
				</code>
			</FieldDescription>
			<ConfirmModal
				open={!!leaving}
				onOpenChange={(open) => !open && setLeaving(null)}
				title={`Disconnect ${leaving?.name ?? "this app"}?`}
				body={`${leaving?.name ?? "It"} stops working with Ekra right away. What it already did stays, as done by you. To use it again, connect it again and approve it.`}
				ok="Disconnect"
				danger
				icon="icon-[solar--link-broken-linear]"
				onConfirm={async () => {
					if (!leaving) return;
					const res = await fetch("/api/auth/oauth2/delete-consent", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id: leaving.id }),
					});
					if (!res.ok) return void toast.error("Couldn't disconnect it.");
					toast.success(`${leaving.name} disconnected`);
					await load();
				}}
			/>
		</Section>
	);
}
