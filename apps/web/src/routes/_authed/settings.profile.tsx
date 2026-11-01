import { Av } from "@ekra/ui/components/av";
import { Button } from "@ekra/ui/components/button";
import { Field, FieldLabel } from "@ekra/ui/components/field";
import { Input } from "@ekra/ui/components/input";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { SBlock, SettingsHeader, SRow } from "@/components/settings-ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/settings/profile")({
	head: () => ({ meta: [{ title: "Profile · Ekra" }] }),
	component: Profile,
});

function Profile() {
	const { viewer } = Route.useRouteContext();
	const router = useRouter();
	const [name, setName] = useState(viewer.name);
	const [busy, setBusy] = useState(false);
	const trimmed = name.trim();

	async function save(event: FormEvent) {
		event.preventDefault();
		if (!trimmed) return void toast.error("Enter your name");
		setBusy(true);
		const { error } = await authClient.updateUser({ name: trimmed });
		setBusy(false);
		if (error) return void toast.error(authErrorMessage(error));
		toast.success("Profile updated");
		await router.invalidate();
	}

	return (
		<>
			<SettingsHeader
				title="Profile"
				lead="How you appear to others in your organizations."
			/>
			<form onSubmit={save} className="flex max-w-[440px] flex-col gap-4">
				<div className="flex items-center gap-3.5">
					<Av name={trimmed || viewer.name} image={viewer.image} size="xl" />
					<p className="text-muted-foreground text-sm">
						{viewer.image
							? "Your picture comes from your Google account."
							: "Your initials show until you add a picture."}
					</p>
				</div>
				<Field>
					<FieldLabel htmlFor="profile-name">Name</FieldLabel>
					<Input
						id="profile-name"
						className="h-10"
						autoComplete="name"
						maxLength={120}
						placeholder="e.g. Amina Kamau"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</Field>
				<div>
					<Button
						type="submit"
						disabled={busy || !trimmed || trimmed === viewer.name}
						aria-busy={busy}
					>
						{busy && <Spinner />}
						Save
					</Button>
				</div>
			</form>
			<SBlock title="Email">
				<SRow t={viewer.email} d="You sign in with this address." />
			</SBlock>
		</>
	);
}
