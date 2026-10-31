import { Input } from "@ekra/ui/components/input";
import { cn } from "@ekra/ui/lib/utils";
import type * as React from "react";

/** An Input with a leading icon, e.g. icon="icon-[solar--letter-linear]". The icon is decorative. */
function InputWithIcon({
	icon,
	className,
	...props
}: React.ComponentProps<typeof Input> & { icon: string }) {
	return (
		<div className="relative">
			<span
				aria-hidden
				className={cn(
					"pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground",
					icon,
				)}
			/>
			<Input className={cn("pl-9", className)} {...props} />
		</div>
	);
}

export { InputWithIcon };
