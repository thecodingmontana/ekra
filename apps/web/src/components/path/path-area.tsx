import { useQuery } from "@apollo/client/react";
import { buttonVariants } from "@ekra/ui/components/button";
import { cn } from "@ekra/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PATH, type PathData } from "@/graphql/path";
import { PathBuilder } from "./path-builder";
import { PathLanding } from "./path-landing";

/** A learning path's content page body: the builder for its trainers (with a learner preview), the landing for learners. */
export function PathArea({
	slug,
	id,
	canManage,
}: {
	slug: string;
	id: string;
	canManage: boolean;
}) {
	const { data, error } = useQuery<PathData>(PATH, {
		variables: { slug, id },
	});
	const [preview, setPreview] = useState(false);
	const path = data?.path;
	if (error && !path)
		return (
			<p role="alert" className="m-0 text-destructive text-sm">
				Couldn't load the path: {error.message}
			</p>
		);
	if (!path) return null;
	if (!canManage) return <PathLanding slug={slug} path={path} />;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<div className="inline-flex w-fit gap-0.5 rounded-lg bg-muted p-0.5 text-sm">
					{(
						[
							[false, "Build", "icon-[solar--pen-linear]"],
							[true, "Preview as learner", "icon-[solar--eye-linear]"],
						] as const
					).map(([value, label, icon]) => (
						<button
							key={label}
							type="button"
							aria-pressed={preview === value}
							onClick={() => setPreview(value)}
							className={cn(
								"inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors",
								preview === value
									? "bg-background text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground",
							)}
							data-testid={value ? "preview-learner" : "build-path"}
						>
							<span className={cn(icon, "size-3.5")} aria-hidden="true" />
							{label}
						</button>
					))}
				</div>
				<Link
					to="/o/$slug/library/$id/assignees"
					params={{ slug, id }}
					className={cn(buttonVariants({ variant: "outline" }), "ml-auto")}
					data-testid="assign-learners"
				>
					<span
						className="icon-[solar--users-group-rounded-linear] size-3.5"
						aria-hidden="true"
					/>
					Assign learners
				</Link>
			</div>
			{preview ? (
				<PathLanding slug={slug} path={path} />
			) : (
				<PathBuilder slug={slug} path={path} />
			)}
		</div>
	);
}
