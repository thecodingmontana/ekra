import { useMutation, useQuery } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { Field, FieldLabel } from "@ekra/ui/components/field";
import { Input } from "@ekra/ui/components/input";
import { ConfirmModal } from "@ekra/ui/components/modal";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import type { DocumentNode } from "graphql";
import { type FormEvent, type ReactNode, useState } from "react";
import { ASSISTANT } from "@/components/assistant/assistant-context";
import { SBlock, SettingsHeader } from "@/components/settings-ui";
import {
	AI_STATUS,
	type AiStatus,
	REMOVE_AI_KEY,
	SET_AI_KEY,
	SET_AI_MODEL,
} from "@/graphql/ai";

export const Route = createFileRoute("/_authed/o/$slug/settings/ai")({
	head: () => ({ meta: [{ title: "AI assistant · Ekra" }] }),
	component: AiSettings,
});

/** A key mutation answers with the whole status, which becomes the cached one. */
function useSave(doc: DocumentNode) {
	return useMutation<{ aiStatus: AiStatus }>(doc, {
		update: (cache, { data }) => {
			if (data) cache.writeQuery({ query: AI_STATUS, data });
		},
	});
}

const failed = (title: string) => (e: unknown) =>
	void toast.error(title, { desc: (e as Error).message });

/** Settings → AI assistant: the day's free messages, and your own OpenRouter key and model. */
function AiSettings() {
	const { data } = useQuery<{ aiStatus: AiStatus }>(AI_STATUS);
	const status = data?.aiStatus;
	const [removing, setRemoving] = useState(false);
	const [remove] = useSave(REMOVE_AI_KEY);
	const left = status ? Math.max(0, status.limit - status.used) : null;

	return (
		<>
			<SettingsHeader
				title="AI assistant"
				lead={`${ASSISTANT} answers questions about your learning and training here, and makes changes once you approve them. Open it from the sidebar or with ⌘J.`}
			/>
			<SBlock title="Which key it uses" first>
				<div className="mt-1.5 flex flex-col gap-2">
					<KeyCard
						on={!!status && !status.ownKey}
						icon="icon-[hugeicons--ai-magic]"
						title="Shared free models"
						line={
							!status
								? "…"
								: status.ready || status.ownKey
									? `${left} of ${status.limit} messages left today`
									: "Not set up on this server"
						}
					/>
					<KeyCard
						on={!!status?.ownKey}
						icon="icon-[solar--key-minimalistic-linear]"
						title="Your OpenRouter key"
						line={
							status?.ownKey
								? `Connected · ${status.ownKey.hint} · ${status.ownKey.model || "free models"}`
								: "Not connected · no daily limit once added"
						}
						action={
							status?.ownKey && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => setRemoving(true)}
								>
									Remove
								</Button>
							)
						}
					/>
				</div>
			</SBlock>
			{status && (
				<SBlock title={status.ownKey ? "Model" : "Add your key"}>
					{status.ownKey ? (
						<ModelForm model={status.ownKey.model} />
					) : (
						<KeyForm />
					)}
				</SBlock>
			)}
			<p className="mt-6 flex gap-1.5 text-[12.5px] text-muted-foreground leading-normal">
				<span
					aria-hidden
					className="icon-[solar--lock-keyhole-minimalistic-linear] mt-0.5 size-3.5 shrink-0"
				/>
				Keys are checked with OpenRouter, then encrypted and tied to your
				account before they're stored. Nobody can read them back: not you, other
				members or admins. They're used only to send your messages to
				OpenRouter, and you can remove them any time.
			</p>
			<ConfirmModal
				open={removing}
				onOpenChange={setRemoving}
				title="Remove your key?"
				body={`${ASSISTANT} goes back to the shared free models, with their daily limit.`}
				ok="Remove key"
				danger
				onConfirm={() =>
					remove()
						.then(() => toast.success("Key removed"))
						.catch(failed("Couldn't remove the key"))
				}
			/>
		</>
	);
}

function KeyCard({
	on,
	icon,
	title,
	line,
	action,
}: {
	on: boolean;
	icon: string;
	title: string;
	line: string;
	action?: ReactNode;
}) {
	return (
		<div
			data-testid="ai-key-card"
			className={cn(
				"flex items-center gap-3 rounded-lg border bg-background px-3.5 py-3 transition-[border-color,box-shadow] duration-150 ease-out",
				on && "border-brand/50 shadow-[0_0_0_3px] shadow-brand/15",
			)}
		>
			<span className="grid size-9 flex-none place-items-center rounded-[10px] border bg-muted">
				<span aria-hidden className={cn(icon, "size-5")} />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-px">
				<b className="font-medium">{title}</b>
				<span className="truncate text-muted-foreground text-sm">{line}</span>
			</div>
			{on && (
				<span className="rounded-full bg-brand/15 px-2.5 py-[3px] font-medium text-xs dark:text-brand">
					In use
				</span>
			)}
			{action}
		</div>
	);
}

function KeyForm() {
	const [key, setKey] = useState("");
	const [model, setModel] = useState("");
	const [save, { loading }] = useSave(SET_AI_KEY);
	const submit = (e: FormEvent) => {
		e.preventDefault();
		save({ variables: { key: key.trim(), model: model.trim() } })
			.then(() => {
				setKey("");
				toast.success("Key added");
			})
			.catch(failed("Couldn't add the key"));
	};
	return (
		<form onSubmit={submit} className="mt-2 flex max-w-[440px] flex-col gap-4">
			<Field>
				<FieldLabel htmlFor="ai-key">OpenRouter API key</FieldLabel>
				<Input
					id="ai-key"
					type="password"
					className="h-10 font-mono"
					autoComplete="off"
					spellCheck={false}
					placeholder="sk-or-…"
					value={key}
					onChange={(e) => setKey(e.target.value)}
				/>
				<p className="text-muted-foreground text-sm">
					Make one at{" "}
					<a
						href="https://openrouter.ai/keys"
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-2"
					>
						openrouter.ai/keys
					</a>
					. It's checked before it's saved.
				</p>
			</Field>
			<ModelField value={model} onChange={setModel} />
			<div>
				<Button type="submit" disabled={loading || !key.trim()}>
					{loading && <Spinner />}
					Check and save
				</Button>
			</div>
		</form>
	);
}

function ModelForm({ model: saved }: { model: string }) {
	const [model, setModel] = useState(saved);
	const [save, { loading }] = useSave(SET_AI_MODEL);
	const submit = (e: FormEvent) => {
		e.preventDefault();
		save({ variables: { model: model.trim() } })
			.then(() => toast.success("Model saved"))
			.catch(failed("Couldn't save the model"));
	};
	return (
		<form onSubmit={submit} className="mt-2 flex max-w-[440px] flex-col gap-4">
			<ModelField value={model} onChange={setModel} />
			<div>
				<Button type="submit" disabled={loading || model.trim() === saved}>
					{loading && <Spinner />}
					Save model
				</Button>
			</div>
		</form>
	);
}

function ModelField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<Field>
			<FieldLabel htmlFor="ai-model">Model (optional)</FieldLabel>
			<Input
				id="ai-model"
				className="h-10 font-mono"
				autoComplete="off"
				spellCheck={false}
				maxLength={160}
				placeholder="free models"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
			<p className="text-muted-foreground text-sm">
				An OpenRouter model id such as vendor/model. Empty uses free models.
			</p>
		</Field>
	);
}
