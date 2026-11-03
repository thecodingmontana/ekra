import { buttonVariants } from "@ekra/ui/components/button";
import { Link } from "@tanstack/react-router";

/** Shown when the last lesson is done. */
export function CourseFinished({
	slug,
	courseId,
	title,
}: {
	slug: string;
	courseId: string;
	title: string;
}) {
	return (
		<div
			className="grid flex-1 place-items-center px-5 py-12"
			data-testid="course-finished"
		>
			<div className="flex max-w-[440px] flex-col items-center gap-2.5 text-center">
				<span className="mb-2 grid size-14 place-items-center rounded-full bg-brand/13 text-brand">
					<span
						className="icon-[solar--cup-star-bold] size-7"
						aria-hidden="true"
					/>
				</span>
				<h1 className="m-0 font-semibold text-xl tracking-[-0.015em]">
					Congratulations, course complete
				</h1>
				<p className="m-0 text-muted-foreground">
					You finished “{title}”. Every lesson is done.
				</p>
				<div className="mt-4 flex flex-wrap justify-center gap-2">
					<Link
						to="/o/$slug/library/$id"
						params={{ slug, id: courseId }}
						className={buttonVariants({ variant: "outline" })}
					>
						Review the course
					</Link>
					<Link
						to="/o/$slug/library"
						params={{ slug }}
						className={buttonVariants()}
						data-testid="back-to-library"
					>
						Back to library
					</Link>
				</div>
			</div>
		</div>
	);
}
