import type { Accessor } from "solid-js";
import { createEffect, onCleanup, Show } from "solid-js";
import {
	createButton,
	createDisplay,
	createLed,
	createOperationInput,
} from "../primitives/hardware-adapter";
import {
	OperationPlace,
	useOperationSlots,
} from "../primitives/operationSlots";
import type { OperationDefinition } from "../the-ten/config";
import { DigitMatchGamePresenter } from "../the-ten/presenter/digitMatchGame";
import { GameSwitcher } from "../the-ten/presenter/gameLifecycle";
import { MakeTenGamePresenter } from "../the-ten/presenter/makeTenGame";
import { cn } from "../utils";
import { Button } from "./Button";
import { CardShape } from "./card";
import { Digit } from "./Digit";
import { Droppable } from "./dnd";
import { Led } from "./Led";
import { OperatorCard } from "./OperationCard";

type OperationEntry = { id: number } & OperationDefinition;

const DISPLAY_LENGTH = 5;

/**
 * OperationSlot
 * 左右の演算スロットを物理カード風に描画するドロップ領域のコンポーネント。
 * 既にカードが置かれている場合は OperationToken を再利用し、空の場合はカード型のプレースホルダを表示する。
 */
const OperationSlot = (props: {
	place: OperationPlace;
	operation: Accessor<OperationEntry | null>;
}) => {
	return (
		<Droppable droppableId={props.place} class={cn("size-fit bg-neutral-100")}>
			<Show
				when={props.operation()}
				fallback={
					<CardShape
						class={cn(
							"grid place-items-center",
							"text-xs font-medium text-neutral-400",
							"border-2 border-dashed border-neutral-300",
							"pointer-events-none select-none",
						)}
					>
						カードを配置
					</CardShape>
				}
			>
				{(operation) => <OperatorCard operation={operation()} />}
			</Show>
		</Droppable>
	);
};

export const GameConsole = (props: {
	operations: Record<number, OperationDefinition>;
}) => {
	// --- 状態とプリミティブの初期化 ------------------------------------------
	const slots = useOperationSlots<number>();

	// Web上で物理ハードウェアを模倣するための仮想デバイスを準備
	const numbersDisplay = createDisplay(DISPLAY_LENGTH);
	const button = createButton();
	const correctLed = createLed();
	const wrongLed = createLed();
	const leftOperationInput = createOperationInput(props.operations);
	const rightOperationInput = createOperationInput(props.operations);

	const makeTenGame = new MakeTenGamePresenter({
		display: numbersDisplay,
		correctLed,
		wrongLed,
		button,
		leftOperationReader: leftOperationInput,
		rightOperationReader: rightOperationInput,
	});
	const slotGame = new DigitMatchGamePresenter({
		display: numbersDisplay,
		button,
		correctLed,
		wrongLed,
	});

	const gameSwitcher = new GameSwitcher(button, [makeTenGame, slotGame]);

	createEffect(() => {
		const current = slots.leftOperation();
		leftOperationInput.setOperationId(current ? current.id : null);
	});

	createEffect(() => {
		const current = slots.rightOperation();
		rightOperationInput.setOperationId(current ? current.id : null);
	});

	const getDigit = (index: number) => numbersDisplay.text()[index] ?? " ";

	onCleanup(() => {
		gameSwitcher.getCurrentGame().stop();
	});

	return (
		<div class="flex flex-col gap-8">
			<div class="flex flex-wrap items-end justify-end gap-4 px-8">
				<Led color="green" isOn={correctLed.isOn()} />
				<Led color="red" isOn={wrongLed.isOn()} />
			</div>

			<div class="flex flex-wrap justify-center gap-5 items-center">
				<Digit char={getDigit(0)} isOn={numbersDisplay.isOn()} />
				<OperationSlot
					place={OperationPlace.Left}
					operation={slots.leftOperation}
				/>
				<Digit char={getDigit(1)} isOn={numbersDisplay.isOn()} />
				<OperationSlot
					place={OperationPlace.Right}
					operation={slots.rightOperation}
				/>
				<Digit char={getDigit(2)} isOn={numbersDisplay.isOn()} />
				<span class="text-4xl">=</span>
				<Digit char={getDigit(3)} isOn={numbersDisplay.isOn()} />
				<Digit char={getDigit(4)} isOn={numbersDisplay.isOn()} />
			</div>

			<div class="flex flex-wrap justify-end items-center gap-3">
				<Button onClick={() => button.triggerClick()}>回答ボタン</Button>
				<Button onClick={() => button.triggerHoldDown()}>ゲーム切替</Button>
			</div>
		</div>
	);
};
