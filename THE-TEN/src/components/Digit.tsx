import { cn } from "../utils";

export const Digit = (props: { char: string; isOn: boolean }) => {
	return (
		<div class="grid place-items-center w-18 h-24 ">
			<span
				class={cn(
					"text-7xl font-seg font-thin",
					"transition-opacity duration-75",
					props.isOn || "opacity-0",
				)}
			>
				{props.char}
			</span>
		</div>
	);
};
