import { type ComponentProps, splitProps } from "solid-js";
import { cn } from "../utils";

export const Button = (props: ComponentProps<"button">) => {
	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<button
			class={cn(
				"px-6 py-2 inline-flex gap-2 rounded bg-zinc-200",
				"hover:bg-zinc-100 active:bg-zinc-200",
				"font-medium",
				"transition-all ease-in-out",
				local.class,
			)}
			{...rest}
		>
			{local.children}
		</button>
	);
};
