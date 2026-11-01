import { buttonVariants } from "@ekra/ui/components/button";
import { cn } from "@ekra/ui/lib/utils";
import {
	type ErrorComponentProps,
	Link,
	useRouter,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Full-page states: a page that doesn't exist (404) and a page that failed to load (500).

function FullState({
	icon,
	danger,
	code,
	title,
	children,
	actions,
}: {
	icon: string;
	danger?: boolean;
	code: string;
	title: string;
	children: ReactNode;
	actions: ReactNode;
}) {
	return (
		<main className="grid min-h-full flex-1 place-items-center px-5 py-10">
			<div className="flex max-w-[420px] flex-col items-center gap-2 text-center">
				<span
					aria-hidden="true"
					className={cn(
						icon,
						"mb-1 size-5",
						danger ? "text-destructive" : "text-muted-foreground",
					)}
				/>
				<span className="font-mono text-muted-foreground text-xs tracking-[0.08em]">
					{code}
				</span>
				<h1 className="font-semibold text-xl tracking-[-0.015em]">{title}</h1>
				<p className="mb-3 text-muted-foreground">{children}</p>
				<div className="flex items-center gap-2">{actions}</div>
			</div>
		</main>
	);
}

export function PageNotFound() {
	const router = useRouter();
	return (
		<FullState
			icon="icon-[solar--file-text-linear]"
			code="ERROR 404"
			title="Page not found"
			actions={
				<>
					<button
						type="button"
						className={buttonVariants({ variant: "outline" })}
						onClick={() => router.history.back()}
					>
						<span
							aria-hidden="true"
							className="icon-[solar--arrow-left-linear] size-3.5"
						/>
						Go back
					</button>
					<Link to="/" className={buttonVariants()}>
						Go to Home
					</Link>
				</>
			}
		>
			The page you're looking for was moved, deleted, or never existed. Check
			the link or head back home.
		</FullState>
	);
}

/** Any error a page throws while loading or rendering (the 500 state). */
export function PageFailed({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
	useEffect(() => reportError(error), [error]);
	return (
		<FullState
			icon="icon-[solar--cloud-cross-linear]"
			danger
			code="ERROR 500"
			title="Something went wrong."
			actions={
				<>
					<Link to="/" className={buttonVariants({ variant: "outline" })}>
						Go to Home
					</Link>
					<button
						type="button"
						className={buttonVariants()}
						onClick={async () => {
							await router.invalidate();
							reset();
						}}
					>
						<span
							aria-hidden="true"
							className="icon-[solar--restart-linear] size-3.5"
						/>
						Try again
					</button>
				</>
			}
		>
			This page failed to load. Your data is safe — try again in a moment.
		</FullState>
	);
}
