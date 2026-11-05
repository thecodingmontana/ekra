import { useApolloClient, useQuery } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { cn } from "@ekra/ui/lib/utils";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { Link } from "@tanstack/react-router";
import {
	type FormEvent,
	Fragment,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { AI_STATUS, type AiStatus } from "@/graphql/ai";
import {
	APPROVAL_TOOLS,
	describeChange,
	MAX_MESSAGE,
	namesFrom,
	stepLabel,
} from "@/lib/assistant";
import { ASSISTANT } from "./assistant-context";

// The assistant's chat: your messages, its streamed answers, the steps behind each one, and the changes it waits
// for you to approve.

const LEARNER_SUGGESTIONS = [
	"What's assigned to me?",
	"What's due this week?",
	"How far am I in my courses?",
];
const MANAGER_SUGGESTIONS = [
	"How are learners doing?",
	"Who's overdue?",
	"Which courses have the lowest completion?",
	"What's in the library?",
];

type ToolCall = { name: string; output: unknown };

export function AssistantChat({
	slug,
	threadId,
	manager,
}: {
	slug: string;
	threadId: string;
	manager: boolean;
}) {
	const [text, setText] = useState("");
	const list = useRef<HTMLDivElement>(null);
	const client = useApolloClient();
	const { data: ai, refetch: refetchAi } = useQuery<{ aiStatus: AiStatus }>(
		AI_STATUS,
	);
	const {
		messages,
		sendMessage,
		isLoading,
		error,
		stop,
		reload,
		interrupts,
		resuming,
	} = useChat({
		connection: fetchServerSentEvents("/api/ai/chat"),
		threadId,
		// the server keeps the conversation; opening the panel loads it back
		persistence: true,
		forwardedProps: { slug },
		tools: APPROVAL_TOOLS,
		// an answer may have changed what's on screen (an assignment, a new draft) and counts down the day's messages
		onFinish: () => void client.refetchQueries({ include: "active" }),
		onError: () => void refetchAi(),
	});
	// each answer may use up one of the day's messages: show the new count once it's done
	useEffect(() => {
		if (!isLoading) void refetchAi();
	}, [isLoading, refetchAi]);
	// keep the newest words in view while the answer streams
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new chunk
	useEffect(() => {
		list.current?.scrollTo({ top: list.current.scrollHeight });
	}, [messages, interrupts.length]);

	// how long each answer worked, for "Worked for 7s" (answers loaded from history show none)
	const timing = useRef(new Map<string, { start: number; seconds?: number }>());
	// the agent's tool rounds come back as several assistant messages: one turn shows them as one answer
	const turns: (typeof messages)[number][] = [];
	for (const m of messages) {
		const prev = turns.at(-1);
		if (m.role === "assistant" && prev?.role === "assistant")
			turns[turns.length - 1] = { ...prev, parts: [...prev.parts, ...m.parts] };
		else turns.push(m);
	}
	const answer = turns.at(-1);
	if (answer?.role === "assistant") {
		const t = timing.current.get(answer.id);
		if (isLoading && !t) timing.current.set(answer.id, { start: Date.now() });
		else if (!isLoading && t && t.seconds === undefined)
			t.seconds = Math.max(1, Math.round((Date.now() - t.start) / 1000));
	}
	const outputs = messages.flatMap((m) =>
		m.parts.flatMap((p) => (p.type === "tool-call" ? [p.output] : [])),
	);

	const status = ai?.aiStatus;
	const left =
		status && !status.ownKey ? Math.max(0, status.limit - status.used) : null;

	const send = (value: string) => {
		const body = value.trim();
		if (!body || isLoading || body.length > MAX_MESSAGE) return;
		setText("");
		void sendMessage(body);
	};
	const submit = (e: FormEvent) => {
		e.preventDefault();
		send(text);
	};

	if (status && !status.ready) return <NotSetUp slug={slug} />;

	return (
		<div className="flex min-h-0 flex-1 flex-col px-4">
			<div
				ref={list}
				aria-live="polite"
				className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-2 pb-4"
			>
				{!messages.length && (
					<div className="my-auto text-center" data-testid="assistant-empty">
						<h2 className="mb-1 font-semibold text-[22px] tracking-[-0.015em]">
							Hi, I'm {ASSISTANT}
						</h2>
						<p className="text-muted-foreground">
							{manager
								? "Ask about your library, learners and reports, or tell me what to assign."
								: "Ask about what's assigned to you, what's due, or a course you're taking."}
						</p>
						<div className="mt-3.5 flex flex-wrap justify-center gap-1.5">
							{(manager ? MANAGER_SUGGESTIONS : LEARNER_SUGGESTIONS).map(
								(s) => (
									<Button
										key={s}
										variant="outline"
										size="sm"
										onClick={() => send(s)}
									>
										{s}
									</Button>
								),
							)}
						</div>
					</div>
				)}
				{turns.map((m, idx) => {
					const last = idx === turns.length - 1;
					const words = m.parts
						.map((p) => (p.type === "text" ? p.content : ""))
						.join("")
						.trim();
					if (m.role === "user")
						return (
							<div
								key={m.id}
								className="max-w-[90%] self-end rounded-[14px_14px_4px_14px] bg-muted px-[13px] py-[9px]"
							>
								<MessageText text={words} />
							</div>
						);
					const calls: ToolCall[] = m.parts.flatMap((p) =>
						p.type === "tool-call"
							? [{ name: String(p.name), output: p.output }]
							: [],
					);
					const live = isLoading && last;
					const time = timing.current.get(m.id);
					return (
						<div
							key={m.id}
							className="flex flex-col gap-1.5"
							data-testid="assistant-answer"
						>
							{calls.length > 0 && (
								<ThinkingCard
									calls={calls}
									live={live}
									startedAt={time?.start}
									seconds={time?.seconds}
									waiting={last && interrupts.length > 0}
								/>
							)}
							{words && <MessageText text={words} />}
							{!live && words && last && (
								<div className="flex items-center gap-0.5">
									<IconButton
										label="Copy"
										icon="icon-[solar--copy-linear]"
										onClick={() => void navigator.clipboard.writeText(words)}
									/>
									<IconButton
										label="Answer again"
										icon="icon-[solar--restart-linear]"
										onClick={() => void reload()}
									/>
								</div>
							)}
						</div>
					);
				})}
				{interrupts.map((it) =>
					it.kind === "tool-approval" ? (
						<Approval
							key={it.id}
							change={describeChange(
								it.toolName,
								(it.originalArgs ?? {}) as Record<string, unknown>,
								namesFrom(outputs),
							)}
							busy={!it.canResolve || resuming}
							onAnswer={(ok) => it.resolveInterrupt(ok)}
						/>
					) : null,
				)}
				{isLoading && turns.at(-1)?.role === "user" && (
					<div className="text-sm">
						<span className="ai-shim on">Thinking…</span>
					</div>
				)}
				{error && (
					<div
						role="alert"
						className="flex items-center gap-2.5 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm"
					>
						<span className="flex-1">
							{error.message || `${ASSISTANT} couldn't answer. Try again.`}
						</span>
						{/daily_limit|messages\. Add|your key|OpenRouter/i.test(
							error.message,
						) ? (
							<Link
								to="/o/$slug/settings/ai"
								params={{ slug }}
								className="shrink-0 font-medium underline underline-offset-4"
							>
								Settings
							</Link>
						) : (
							<Button variant="outline" size="sm" onClick={() => void reload()}>
								Try again
							</Button>
						)}
					</div>
				)}
			</div>
			<form
				onSubmit={submit}
				className="mb-4 rounded-lg border bg-background px-2.5 py-2 transition-[border-color,box-shadow] focus-within:border-brand/60 focus-within:ring-4 focus-within:ring-brand/15"
			>
				<textarea
					value={text}
					rows={2}
					maxLength={MAX_MESSAGE}
					placeholder={`Ask ${ASSISTANT}…`}
					aria-label={`Message ${ASSISTANT}`}
					data-testid="assistant-input"
					className="w-full resize-none border-0 bg-transparent outline-none placeholder:text-muted-foreground"
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							send(text);
						}
					}}
				/>
				<div className="flex items-center justify-end gap-2">
					{isLoading ? (
						<Button variant="outline" size="sm" onClick={stop}>
							Stop
						</Button>
					) : (
						<Button type="submit" size="sm" disabled={!text.trim()}>
							Send
						</Button>
					)}
				</div>
			</form>
			<p className="-mt-2.5 mb-2.5 text-center text-[11px] text-muted-foreground">
				{left !== null && (
					<>
						{left} of {status?.limit} messages left today.{" "}
						<Link
							to="/o/$slug/settings/ai"
							params={{ slug }}
							className="underline underline-offset-2 hover:text-foreground"
						>
							Add your own key
						</Link>{" "}
						for more.
					</>
				)}
			</p>
		</div>
	);
}

/** No shared key on the server and no key of your own: say so, and where to add one. */
function NotSetUp({ slug }: { slug: string }) {
	return (
		<div
			className="m-auto max-w-[320px] px-4 text-center"
			data-testid="assistant-not-set-up"
		>
			<span
				aria-hidden
				className="icon-[hugeicons--ai-magic] mb-2 inline-block size-7 text-muted-foreground"
			/>
			<h2 className="mb-1 font-semibold text-lg">{ASSISTANT} isn't set up</h2>
			<p className="mb-4 text-muted-foreground text-sm">
				This server has no AI key yet. Add your own OpenRouter key to use{" "}
				{ASSISTANT}, or ask whoever runs Ekra to set one up.
			</p>
			<Link
				to="/o/$slug/settings/ai"
				params={{ slug }}
				className="font-medium text-sm underline underline-offset-4"
			>
				Add your own key
			</Link>
		</div>
	);
}

function IconButton({
	label,
	icon,
	onClick,
}: {
	label: string;
	icon: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			<span aria-hidden className={cn(icon, "size-3.5")} />
		</button>
	);
}

/** "Thinking 3s" → "Worked for 7s": the steps behind an answer, the running one shimmering. */
function ThinkingCard({
	calls,
	live,
	startedAt,
	seconds,
	waiting,
}: {
	calls: ToolCall[];
	live: boolean;
	/** a change in this answer waits for the person's approval */
	waiting: boolean;
	startedAt?: number;
	seconds?: number;
}) {
	const [open, setOpen] = useState(true);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!live) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [live]);
	const elapsed = live
		? Math.max(1, Math.round((now - (startedAt ?? now)) / 1000))
		: seconds;
	return (
		<div className="overflow-hidden rounded-lg border bg-background text-sm">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground"
			>
				<span aria-hidden className="icon-[solar--widget-2-linear] size-3.5" />
				<b
					className={cn(
						"font-medium",
						live ? "text-muted-foreground" : "text-foreground",
					)}
				>
					{live ? "Thinking" : elapsed ? `Worked for ${elapsed}s` : "Worked"}
				</b>
				{live && <span className="tabular-nums">{elapsed}s</span>}
				<span className="flex-1" />
				<span
					aria-hidden
					className={cn(
						"icon-[solar--alt-arrow-down-linear] size-3.5 transition-transform",
						!open && "-rotate-90",
					)}
				/>
			</button>
			{open && (
				<ol className="flex flex-col gap-[7px] border-t px-3 pt-2 pb-2.5">
					{calls.map((call, i) => {
						const running = live && i === calls.length - 1 && !call.output;
						return (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: steps only ever append
								key={i}
								className={cn(
									"relative pl-4 text-muted-foreground before:absolute before:top-[7px] before:left-[3px] before:size-[5px] before:rounded-full before:bg-border",
									running && "before:bg-brand",
								)}
							>
								<span className={cn("ai-shim", running && "on")}>
									{call.output === undefined && !running
										? `${stepLabel(call.name, false)}: ${waiting ? "waiting for your approval" : "not done"}`
										: stepLabel(call.name, !running)}
								</span>
							</li>
						);
					})}
					{!live && (
						<li className="flex items-center gap-1.5 font-medium text-foreground">
							<span
								aria-hidden
								className="icon-[solar--check-circle-bold] size-3.5 text-brand"
							/>
							Finished thinking
						</li>
					)}
				</ol>
			)}
		</div>
	);
}

/** "Approve this?": what the assistant wants to change, before it does. */
function Approval({
	change,
	busy,
	onAnswer,
}: {
	change: { title: string; lines: string[] };
	busy: boolean;
	onAnswer: (approved: boolean) => void;
}) {
	return (
		<fieldset
			aria-label={`Approve ${ASSISTANT}'s change`}
			data-testid="assistant-approval"
			className="m-0 min-w-0 self-start rounded-lg border border-brand/40 bg-brand/10 px-3.5 py-2.5 text-sm"
		>
			<div className="flex items-center gap-2 font-semibold">
				<span
					aria-hidden
					className="icon-[solar--shield-warning-linear] size-4"
				/>
				{change.title}
			</div>
			{change.lines.length > 0 && (
				<ul className="mt-1.5 mb-2 ml-[18px] list-disc text-muted-foreground">
					{change.lines.map((l) => (
						<li key={l}>{l}</li>
					))}
				</ul>
			)}
			<div className="mt-2 flex gap-1.5">
				<Button size="sm" disabled={busy} onClick={() => onAnswer(true)}>
					Approve
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={busy}
					onClick={() => onAnswer(false)}
				>
					Cancel
				</Button>
			</div>
		</fieldset>
	);
}

/** One line of text with **bold** and `code`. */
function inline(text: string, key: string): ReactNode[] {
	return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((bit, i) =>
		bit.startsWith("**") && bit.endsWith("**") ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: pieces of one line
			<b key={`${key}-${i}`}>{bit.slice(2, -2)}</b>
		) : bit.startsWith("`") && bit.endsWith("`") ? (
			<code
				// biome-ignore lint/suspicious/noArrayIndexKey: pieces of one line
				key={`${key}-${i}`}
				className="rounded bg-muted px-1 py-px text-[0.92em]"
			>
				{bit.slice(1, -1)}
			</code>
		) : (
			bit
		),
	);
}

/** A message's text with light markdown: bold, code and bullet lists (as text, never HTML). */
function MessageText({ text }: { text: string }) {
	return (
		<div className="whitespace-pre-wrap leading-[1.55]">
			{text.split("\n").map((line, i) => {
				const key = `l${i}`;
				const bullet = /^\s*(?:[-*•]|\d+\.) (.*)$/.exec(line);
				return (
					<Fragment key={key}>
						{i > 0 && !bullet && "\n"}
						{bullet ? (
							<span className="relative block pl-4 before:absolute before:top-[0.6em] before:left-[5px] before:size-[5px] before:rounded-full before:bg-muted-foreground/60">
								{inline(bullet[1] ?? "", key)}
							</span>
						) : (
							inline(line.replace(/^#{1,6} /, ""), key)
						)}
					</Fragment>
				);
			})}
		</div>
	);
}
