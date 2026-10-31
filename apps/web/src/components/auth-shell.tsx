import type { ReactNode } from "react";

/** zadaci's auth layout: one centred column with the logo, a title, a line of help, then the form. */
export function AuthShell({
	title,
	description,
	children,
}: {
	title: string;
	description: ReactNode;
	children: ReactNode;
}) {
	return (
		<main className="grid min-h-dvh place-items-center px-4 py-10">
			<div className="flex w-full max-w-sm flex-col gap-6">
				<div className="flex flex-col items-center gap-4 text-center">
					<a
						href="/"
						className="rounded-md text-4xl font-semibold tracking-tight"
					>
						Ekra
					</a>
					<div className="space-y-1">
						<h1 className="text-2xl font-bold text-balance">{title}</h1>
						<p className="text-sm text-pretty text-muted-foreground">
							{description}
						</p>
					</div>
				</div>
				{children}
			</div>
		</main>
	);
}
