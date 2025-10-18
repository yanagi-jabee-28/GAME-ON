import { type ComponentProps, splitProps } from "solid-js";
import { cn } from "../utils";

export const CardShape = (props: ComponentProps<"div">) => {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={cn(
				"h-28 w-24 rounded-lg border border-neutral-200 bg-neutral-50",
				local.class,
			)}
			{...rest}
		>
			{local.children}
		</div>
	);
};
