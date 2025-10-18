import { For, Show } from "solid-js";
import {
	OperationPlace,
	useOperationSlots,
} from "../primitives/operationSlots";
import { cn } from "../utils";
import { Droppable } from "./dnd";
import { OperatorCard } from "./OperationCard";

export const ReserveOperations = (props: { class?: string }) => {
	const slots = useOperationSlots<number>();

	return (
		<Droppable
			droppableId={OperationPlace.Reserve}
			class={cn(
				"rounded-xl border-2 border-dashed border-neutral-300 px-6 py-4",
				props.class,
			)}
		>
			<div class="font-medium text-neutral-500 text-sm">リザーブ</div>
			<div class="flex min-h-[9rem] flex-wrap items-center gap-3">
				<Show
					when={slots.reserveOperations().length > 0}
					fallback={
						<p class="text-sm text-neutral-400">利用可能なカードはありません</p>
					}
				>
					<For each={slots.reserveOperations()}>
						{(operation) => <OperatorCard operation={operation} />}
					</For>
				</Show>
			</div>
		</Droppable>
	);
};
