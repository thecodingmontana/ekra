import { passwordChecks, passwordScore } from "@ekra/core";
import { Field, FieldLabel } from "@ekra/ui/components/field";
import { InputWithIcon } from "@ekra/ui/components/input-with-icon";
import { useState } from "react";

const BAR = [
	"bg-border",
	"bg-red-500",
	"bg-orange-500",
	"bg-amber-500",
	"bg-brand",
];
const LABEL = [
	"Enter a password",
	"Weak password",
	"Weak password",
	"Medium password",
	"Strong password",
];

/** A new password with a show/hide toggle and a strength meter. The server checks the same rules. */
export function PasswordField({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const [visible, setVisible] = useState(false);
	const checks = passwordChecks(value);
	const score = passwordScore(value);

	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<div className="relative">
				<InputWithIcon
					icon="icon-[solar--lock-password-linear]"
					id={id}
					type={visible ? "text" : "password"}
					autoComplete="new-password"
					placeholder="At least 10 characters"
					minLength={10}
					maxLength={128}
					required
					value={value}
					onChange={(e) => onChange(e.target.value)}
					aria-describedby={`${id}-strength`}
					className="pr-9"
				/>
				<button
					type="button"
					onClick={() => setVisible((v) => !v)}
					aria-label={visible ? "Hide password" : "Show password"}
					aria-pressed={visible}
					className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span
						aria-hidden
						className={`size-4 ${visible ? "icon-[solar--eye-closed-linear]" : "icon-[solar--eye-linear]"}`}
					/>
				</button>
			</div>
			<div
				role="progressbar"
				aria-label="Password strength"
				aria-valuemin={0}
				aria-valuemax={4}
				aria-valuenow={score}
				className="h-1 w-full overflow-hidden rounded-full bg-border"
			>
				<div
					className={`h-full w-full origin-left transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${BAR[score]}`}
					style={{ transform: `scaleX(${score / 4})` }}
				/>
			</div>
			<p id={`${id}-strength`} className="text-xs font-medium">
				{LABEL[score]}. Must contain:
			</p>
			<ul className="space-y-1" aria-label="Password requirements">
				{checks.map((check) => (
					<li key={check.id} className="flex items-center gap-2 text-xs">
						<span
							aria-hidden
							className={`size-3.5 ${check.met ? "icon-[solar--check-circle-bold] text-brand" : "icon-[solar--close-circle-linear] text-muted-foreground"}`}
						/>
						<span
							className={
								check.met ? "text-foreground" : "text-muted-foreground"
							}
						>
							{check.text}
							<span className="sr-only">
								{check.met ? " (met)" : " (not met yet)"}
							</span>
						</span>
					</li>
				))}
			</ul>
		</Field>
	);
}
