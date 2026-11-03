import { useQuery } from "@apollo/client/react";
import { cn } from "@ekra/ui/lib/utils";
import { useState } from "react";
import { COURSE, type CourseData } from "@/graphql/course";
import { CourseBuilder } from "./course-builder";
import { CourseLanding } from "./course-landing";

/** A course's content page body: the builder for its trainers (with a learner preview), the landing for learners. */
export function CourseArea({
	slug,
	id,
	cover,
	canManage,
}: {
	slug: string;
	id: string;
	cover: string | null;
	canManage: boolean;
}) {
	const { data, error } = useQuery<CourseData>(COURSE, {
		variables: { slug, id },
	});
	const [preview, setPreview] = useState(false);
	const course = data?.course;
	if (error && !course)
		return (
			<p role="alert" className="m-0 text-destructive text-sm">
				Couldn't load the course: {error.message}
			</p>
		);
	if (!course) return null;
	if (!canManage)
		return <CourseLanding slug={slug} course={course} cover={cover} />;

	return (
		<div className="flex flex-col gap-4">
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
						data-testid={value ? "preview-learner" : "build-course"}
					>
						<span className={cn(icon, "size-3.5")} aria-hidden="true" />
						{label}
					</button>
				))}
			</div>
			{preview ? (
				<CourseLanding slug={slug} course={course} cover={cover} />
			) : (
				<CourseBuilder slug={slug} course={course} />
			)}
		</div>
	);
}
