import {
	DragDropProvider,
	DragDropSensors,
	type DragEventHandler,
} from "@thisbeyond/solid-dnd";
import type { ParentProps } from "solid-js";
import {
	OperationPlace,
	useOperationSlots,
} from "../primitives/operationSlots";

export const OperationDragDropBoundary = (props: ParentProps) => {
	const slots = useOperationSlots<number>();

	// 物理カードの移動結果でスロットの状態を更新する
	const handleDragEnd: DragEventHandler = ({ draggable, droppable }) => {
		// 💩
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
			{props.children}
		</DragDropProvider>
	);
};
