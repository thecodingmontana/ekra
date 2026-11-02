import { useMutation } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { Input } from "@ekra/ui/components/input";
import { Modal, ModalBody } from "@ekra/ui/components/modal";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { type FormEvent, useEffect, useState } from "react";
import {
	type ContentItem,
	type ContentKind,
	CREATE_CONTENT,
	UPDATE_CONTENT,
} from "@/graphql/library";
import { KIND_ORDER, KINDS } from "@/lib/content-kinds";
import { KindIcon } from "./bits";
import { CoverPicker, TagInput } from "./content-form-fields";

// mutations return the whole item, so an open content page updates from the cache; lists refetch
export const REFETCH = { refetchQueries: ["Library"] };

const TEXTAREA =
	"min-h-[72px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base leading-normal outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** "New content" (pick a kind, name it) and "Edit details" for existing content. */
export function ContentFormModal({
	open,
	onOpenChange,
	slug,
	item,
	parentId,
	kind: startKind,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	slug: string;
	/** the content being edited; omit to create */
	item?: ContentItem;
	/** create inside this folder */
	parentId?: string | null;
	/** the kind picked first when creating */
	kind?: ContentKind;
	onCreated?: (item: ContentItem) => void;
}) {
	const initial = () => ({
		kind: item?.kind ?? startKind ?? ("course" as ContentKind),
		title: item?.title ?? "",
		description: item?.description ?? "",
		isTemplate: item?.isTemplate ?? false,
		tags: item?.tags ?? [],
		cover: item?.cover ?? null,
	});
	const [form, setForm] = useState(initial);
	const [err, setErr] = useState("");
	const [create, { loading: creating }] = useMutation<{
		createContent: ContentItem;
	}>(CREATE_CONTENT, REFETCH);
	const [update, { loading: saving }] = useMutation(UPDATE_CONTENT, REFETCH);
	const [uploading, setUploading] = useState(false);
	const busy = creating || saving || uploading;

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
	useEffect(() => {
		if (open) {
			setForm(initial());
			setErr("");
		}
	}, [open]);

	const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
		setForm((f) => ({ ...f, [k]: v }));
	const k = KINDS[form.kind];

	async function submit(event?: FormEvent) {
		event?.preventDefault();
		const title = form.title.trim();
		if (!title) return setErr(`Give the ${k.label.toLowerCase()} a name.`);
		const fields = {
			title,
			description: form.description.trim() || null,
			tags: form.tags,
			cover: form.cover,
			...(form.kind !== "folder" && { isTemplate: form.isTemplate }),
		};
		try {
			if (item) {
				await toast.promise(
					update({ variables: { slug, id: item.id, input: fields } }),
					{
						loading: "Saving…",
						success: "Saved",
						error: "Couldn't save the changes",
					},
				);
				onOpenChange(false);
				return;
			}
			const { data } = await toast.promise(
				create({
					variables: {
						slug,
						input: { ...fields, kind: form.kind, parentId: parentId ?? null },
					},
				}),
				{
					loading: `Creating ${title}…`,
					success: `Created ${title}`,
					error: `Couldn't create the ${k.label.toLowerCase()}`,
				},
			);
			onOpenChange(false);
			if (data) onCreated?.(data.createContent);
		} catch (error) {
			setErr((error as Error).message);
		}
	}

	return (
		<Modal
			busy={busy}
			open={open}
			onOpenChange={onOpenChange}
			title={item ? `Edit ${k.label.toLowerCase()}` : "New content"}
			sub={item ? undefined : k.lead}
			footer={
				<>
					<span className="flex-1" />
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="content-form"
						disabled={busy}
						data-testid="content-submit"
					>
						{item ? "Save changes" : `Create ${k.label.toLowerCase()}`}
					</Button>
				</>
			}
		>
			<form id="content-form" onSubmit={submit} className="contents">
				<ModalBody>
					{!item && (
						<fieldset className="flex min-w-0 flex-col gap-1.5">
							<legend className="mb-1.5 font-medium text-sm">Kind</legend>
							<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
								{KIND_ORDER.map((kind) => (
									<label
										key={kind}
										data-testid={`kind-${kind}`}
										className={cn(
											"flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-[border-color,background-color,box-shadow] duration-140 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
											form.kind === kind
												? "border-brand bg-brand/8 shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_18%,transparent)]"
												: "hover:bg-muted",
										)}
									>
										<input
											type="radio"
											name="kind"
											value={kind}
											className="sr-only"
											checked={form.kind === kind}
											onChange={() => set("kind", kind)}
										/>
										<KindIcon kind={kind} decorative />
										<span className="font-medium leading-tight">
											{KINDS[kind].label}
										</span>
									</label>
								))}
							</div>
						</fieldset>
					)}
					<div className="flex flex-col gap-1.5">
						<label className="font-medium text-sm" htmlFor="c-title">
							Name
						</label>
						<Input
							id="c-title"
							value={form.title}
							onChange={(e) => {
								set("title", e.target.value);
								if (err && e.target.value.trim()) setErr("");
							}}
							placeholder={`e.g. ${PLACEHOLDER[form.kind]}`}
							maxLength={200}
							aria-invalid={!!err}
							aria-describedby={err ? "c-title-err" : undefined}
							autoFocus
						/>
						{err && (
							<span
								className="flex items-center gap-1 text-destructive text-xs"
								id="c-title-err"
								role="alert"
							>
								<span
									className="icon-[solar--danger-circle-linear] size-3"
									aria-hidden="true"
								/>
								{err}
							</span>
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						<label className="font-medium text-sm" htmlFor="c-desc">
							Description{" "}
							<span className="font-normal text-muted-foreground">
								(optional)
							</span>
						</label>
						<textarea
							id="c-desc"
							className={TEXTAREA}
							value={form.description}
							onChange={(e) => set("description", e.target.value)}
							placeholder="What it covers and who it's for"
							maxLength={2000}
							rows={3}
						/>
					</div>
					<TagInput
						slug={slug}
						value={form.tags}
						onChange={(tags) => set("tags", tags)}
					/>
					<CoverPicker
						slug={slug}
						value={form.cover}
						onChange={(cover) => set("cover", cover)}
						onBusy={setUploading}
					/>
					{form.kind !== "folder" && (
						<label className="flex cursor-pointer items-start gap-2.5 text-sm">
							<input
								type="checkbox"
								className="mt-0.5 size-3.5 accent-(--brand)"
								checked={form.isTemplate}
								onChange={(e) => set("isTemplate", e.target.checked)}
								data-testid="content-template"
							/>
							<span>
								<span className="font-medium">Template</span>
								<span className="block text-muted-foreground">
									A starting point your team copies. Learners never see
									templates.
								</span>
							</span>
						</label>
					)}
				</ModalBody>
			</form>
		</Modal>
	);
}

const PLACEHOLDER: Record<ContentKind, string> = {
	folder: "Onboarding",
	page: "Code of conduct",
	course: "Customer service basics",
	quiz: "Fire safety check",
	assignment: "Write your first proposal",
	path: "New starter's first month",
	wiki: "How we work",
};
