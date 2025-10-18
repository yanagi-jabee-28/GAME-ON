import { createDraggable, createDroppable } from "@thisbeyond/solid-dnd";
import { type ComponentProps, splitProps } from "solid-js";
import type { OperationPlace } from "../primitives/operationSlots";
import { cn } from "../utils";

export const Draggable = <Id extends number>(
	props: ComponentProps<"div"> & {
		draggableId: Id;
	},
) => {
	const [local, rest] = splitProps(props, ["draggableId", "class"]);
	const draggable = createDraggable(local.draggableId);

	const className = () =>
		cn(
			"transition-colors",
			local.class,
			draggable.isActiveDraggable && "opacity-0",
		);
	return (
		<div
			// DragOverlayを使用するため、元の要素にはtransformを適用しない
			use:draggable={() => ({ skipTransform: true })}
			class={className()}
			data-draggable-id={local.draggableId}
			data-drag-state={draggable.isActiveDraggable ? "active" : undefined}
			{...rest}
		/>
	);
};

export const Droppable = (
	props: ComponentProps<"div"> & {
		droppableId: OperationPlace;
	},
) => {
	const [local, rest] = splitProps(props, ["droppableId", "class"]);
	const droppable = createDroppable(local.droppableId);

	const className = () =>
		cn(
			"transition-colors",
			local.class,
			droppable.isActiveDroppable &&
				"outline-2 outline-offset-4 outline-blue-400",
		);

	return (
		<div
			use:droppable={droppable}
			class={className()}
			data-droppable-id={local.droppableId}
			data-drop-state={droppable.isActiveDroppable ? "active" : undefined}
			{...rest}
		/>
	);
};
