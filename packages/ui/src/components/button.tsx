import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@ekra/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

// Buttons on Base UI, in Ekra green: a solid brand fill with inset highlights, a small press-scale, and
// compact sizes (default 30px, lg 36px).
const variants = cva(
	"group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-[scale,box-shadow,background-color,color,border-color] duration-150 ease-out outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-safe:not-disabled:active:scale-[0.96] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"bg-brand text-brand-foreground shadow-[0_-1px_0_1px_rgba(0,160,94,0.9)_inset,0_0_0_1px_#00c473_inset,0_0.5px_0_1.5px_rgba(255,255,255,0.35)_inset] hover:shadow-[0_-1px_0_1px_rgba(0,140,82,0.9)_inset,0_0_0_1px_#00c473_inset,0_0.5px_0_1.5px_rgba(255,255,255,0.55)_inset] focus-visible:ring-brand/40",
				destructive:
					"bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
				outline:
					"border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80",
				ghost:
					"hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
				link: "text-foreground underline-offset-4 hover:underline motion-safe:not-disabled:active:scale-100",
			},
			size: {
				default: "h-[30px] px-[11px]",
				xs: "h-[22px] gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
				sm: "h-[26px] gap-1.5 px-2 text-xs",
				lg: "h-9 px-3.5 text-base",
				icon: "size-[30px]",
				"icon-xs": "size-[22px] [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-[26px]",
				"icon-lg": "size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

/** Button classes, conflicts resolved (e.g. border-transparent vs an outline border), for links styled as buttons. */
const buttonVariants = (props?: Parameters<typeof variants>[0]) =>
	cn(variants(props));

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof variants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(variants({ variant, size, className }))}
			{...props}
		/>
	);
}

/** The arrow for buttons that move forward ("Continue", "Get started"): it slides in when the button is hovered. */
function ArrowChip() {
	return (
		<span
			aria-hidden
			className="size-6 overflow-hidden rounded-full border border-black/10 bg-black/5 transition-colors duration-300 group-hover/button:bg-black/10"
		>
			<span className="flex w-12 -translate-x-1/2 transition-transform duration-300 ease-[cubic-bezier(0.77,0,0.175,1)] group-hover/button:translate-x-0 motion-reduce:transition-none">
				<span className="flex size-6">
					<span className="m-auto icon-[solar--arrow-right-linear] size-3.5" />
				</span>
				<span className="flex size-6">
					<span className="m-auto icon-[solar--arrow-right-linear] size-3.5" />
				</span>
			</span>
		</span>
	);
}

export { ArrowChip, Button, buttonVariants };
