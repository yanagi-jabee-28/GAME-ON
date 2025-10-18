import { cva } from "class-variance-authority";

const ledVariants = cva("size-6 rounded-full", {
	variants: {
		color: {
			red: "bg-red-500",
			green: "bg-green-500",
		},
		isOn: {
			false: "opacity-10",
		},
	},
	defaultVariants: {
		color: "red",
		isOn: false,
	},
});

export const Led = (props: { isOn: boolean; color: "red" | "green" }) => {
	return <div class={ledVariants({ color: props.color, isOn: props.isOn })} />;
};
