import {
	DragDropProvider,
	DragDropSensors,
	DragOverlay,
	type DragEventHandler,
} from "@thisbeyond/solid-dnd";
import type { ParentProps } from "solid-js";
import { Show } from "solid-js";
import {
	OperationPlace,
	useOperationSlots,
} from "../primitives/operationSlots";
import { OPERATIONS } from "../the-ten/config";
import { CardShape } from "./card";
import { cn } from "../utils";

export const OperationDragDropBoundary = (props: ParentProps) => {
	const slots = useOperationSlots<number>();

	// 物理カードの移動結果でスロットの状態を更新する
	const handleDragEnd: DragEventHandler = ({ draggable, droppable }) => {
		if (!draggable) return;
		if (!droppable) return;
		const id = draggable?.id;
		if (typeof id !== "number") return;

		const nextPlace = (() => {
			if (droppable?.id === OperationPlace.Left) return OperationPlace.Left;
			if (droppable?.id === OperationPlace.Right) return OperationPlace.Right;
			if (droppable?.id === OperationPlace.Reserve)
				return OperationPlace.Reserve;
			return OperationPlace.Reserve;
		})();

		slots.moveTo(id, nextPlace);
	};

	return (
		<DragDropProvider onDragEnd={handleDragEnd}>
			<DragDropSensors />
			<DragOverlay>
				{(draggable) => (
					<Show when={draggable}>
						{(activeDraggable) => {
							const id = activeDraggable().id as number;
							const operation = OPERATIONS[id];
							return (
								<CardShape
									class={cn(
										"grid place-items-center bg-white p-2",
										"cursor-grabbing shadow-2xl opacity-90",
									)}
								>
									<span class="text-5xl font-semibold text-neutral-900">
										{operation.symbol}
									</span>
								</CardShape>
							);
						}}
					</Show>
				)}
			</DragOverlay>
			{props.children}
		</DragDropProvider>
	);
};
