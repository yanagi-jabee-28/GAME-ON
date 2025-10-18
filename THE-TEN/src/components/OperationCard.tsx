import { cn } from "../utils";
import { CardShape } from "./card";
import { Draggable } from "./dnd";

export const OperatorCard = (props: {
	operation: {
		id: number;
		name: string;
		symbol: string;
	};
}) => {
	return (
		<Draggable
			draggableId={props.operation.id}
			class={cn("cursor-grab select-none active:cursor-grabbing")}
		>
			<CardShape class={cn("grid place-items-center bg-white p-2")}>
				<span class="text-5xl font-semibold text-neutral-900">
					{props.operation.symbol}
				</span>
			</CardShape>
		</Draggable>
	);
};
