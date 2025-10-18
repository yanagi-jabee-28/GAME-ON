import { type Accessor, createSignal, type Setter } from "solid-js";
import type {
	ButtonEvent,
	IButton,
	IDisplay,
	ILED,
	IReedSwitch,
} from "../the-ten/hardware";
import type { Operation } from "../the-ten/logic/calculation";
import type {
	InvalidInput,
	IOperationReader,
	ValidInput,
} from "../the-ten/presenter/operationInput";

/**
 * イベントリスナー管理用のプリミティブ
 * on/onceリスナーの登録、削除、トリガーを管理する
 */
const createEventEmitter = () => {
	const [listeners, setListeners] = createSignal<Array<() => void>>([]);
	const [onceListeners, setOnceListeners] = createSignal<Array<() => void>>([]);

	const on = (listener: () => void) => {
		setListeners((prev) => [...prev, listener]);
	};

	const once = (listener: () => void) => {
		setOnceListeners((prev) => [...prev, listener]);
	};

	const removeAll = () => {
		setListeners([]);
		setOnceListeners([]);
	};

	const trigger = () => {
		// 通常のリスナーを実行
		const currentListeners = listeners();
		currentListeners.forEach((listener) => {
			listener();
		});

		// onceリスナーを実行して削除（実行中に追加されたリスナーは次回実行される）
		const currentOnceListeners = onceListeners();
		setOnceListeners([]);
		currentOnceListeners.forEach((listener) => {
			listener();
		});
	};

	return {
		on,
		once,
		removeAll,
		trigger,
	};
};

export const createButton = (): IButton & {
	triggerClick: () => void;
	triggerHoldDown: () => void;
} => {
	const clickEmitter = createEventEmitter();
	const holdDownEmitter = createEventEmitter();

	const getEmitter = (eventName: ButtonEvent) => {
		return eventName === "click" ? clickEmitter : holdDownEmitter;
	};

	const on = (eventName: ButtonEvent, listener: () => void) => {
		getEmitter(eventName).on(listener);
	};

	const once = (eventName: ButtonEvent, listener: () => void) => {
		getEmitter(eventName).once(listener);
	};

	const removeAllListeners = (eventName?: ButtonEvent) => {
		if (eventName) {
			getEmitter(eventName).removeAll();
		} else {
			clickEmitter.removeAll();
			holdDownEmitter.removeAll();
		}
	};

	const triggerClick = () => {
		clickEmitter.trigger();
	};

	const triggerHoldDown = () => {
		holdDownEmitter.trigger();
	};

	return {
		on,
		once,
		removeAllListeners,
		read: () => 0, // Web版では常に0を返す
		triggerClick,
		triggerHoldDown,
	};
};

export const createLed = (): ILED & { isOn: Accessor<boolean> } => {
	const [isOn, setIsOn] = createSignal(false);
	const on = () => {
		console.log("LED on");
		setIsOn(true);
	};
	const off = () => {
		console.log("LED off");
		setIsOn(false);
	};
	return {
		isOn,
		on,
		off,
	};
};

export const createReedSwitch = (): IReedSwitch & {
	setIsOn: Setter<boolean>;
} => {
	const [isOn, setIsOn] = createSignal(false);
	const read = () => (isOn() ? 1 : 0);

	return {
		read,
		setIsOn,
	};
};

export const createDisplay = (
	length: number,
): IDisplay & {
	text: Accessor<string>;
	isOn: Accessor<boolean>;
} => {
	const emptyString = " ".repeat(length);

	const [text, setText] = createSignal(emptyString);
	const display = (newText: string) => {
		setText(newText.padEnd(length).slice(0, length));
	};
	const clear = () => setText(emptyString);

	const [isOn, setIsOn] = createSignal(false);
	const on = () => setIsOn(true);
	const off = () => setIsOn(false);

	return {
		text,
		isOn,
		display,
		clear,
		on,
		off,
	};
};

export const createOperationInput = <
	Ids extends number,
	Def extends { op: Operation },
>(
	operations: Record<Ids, Def>,
): IOperationReader & {
	operationId: Accessor<Ids | null>;
	setOperationId: Setter<Ids | null>;
} => {
	const [operationId, setOperationId] = createSignal<Ids | null>(null);

	const read = () => {
		const id = operationId();
		if (id === null) {
			return { success: false, value: 0 } as const satisfies InvalidInput;
		}

		return {
			success: true,
			value: id,
			operation: operations[id].op,
		} as const satisfies ValidInput;
	};

	return {
		read,
		operationId,
		setOperationId,
	};
};
