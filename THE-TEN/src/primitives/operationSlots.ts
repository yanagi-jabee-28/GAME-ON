import {
	type Accessor,
	batch,
	createComponent,
	createContext,
	createMemo,
	createSignal,
	type JSX,
	type ParentProps,
	useContext,
} from "solid-js";
import type { Operation } from "../the-ten/logic/calculation";

// 配置先を表す型と、enum風の定数をエクスポート
export const OperationPlace = {
	Left: "left",
	Right: "right",
	Reserve: "reserve",
} as const;
export type OperationPlace =
	(typeof OperationPlace)[keyof typeof OperationPlace];

export type OperationSlotsApi<Ids extends number> = {
	leftId: Accessor<Ids | null>;
	rightId: Accessor<Ids | null>;
	reserveIds: Accessor<Ids[]>;

	leftOperation: Accessor<{ id: Ids; name: string; op: Operation } | null>;
	rightOperation: Accessor<{ id: Ids; name: string; op: Operation } | null>;
	reserveOperations: Accessor<Array<{ id: Ids; name: string; op: Operation }>>;

	moveTo: (id: Ids, place: OperationPlace) => boolean;
	reset: () => void;
};

/**
 * createOperationSlots
 * 物理カード＋スロット（左/右）を模した演算子カードの状態管理プリミティブ。
 * - 左右スロットにどの演算IDが入っているかを保持
 * - リザーブ（未配置）の演算IDを派生して提供
 * - 配置/取り外し/スワップ/左右移動などの操作を提供
 *
 * 挙動は物理カードを想定：
 * - カードをスロットに置くとリザーブから取り除かれる
 * - スロットから外すとリザーブに戻る
 * - 片方のスロットに置かれているIDをもう片方に置いた場合は、重複なく移動される
 *
 * 使用例:
 * const slots = createOperationSlots(OPERATIONS);
 * slots.placeLeft(1); // 左にADDを配置
 * slots.placeRight(4); // 右にMULTIPLYを配置
 * slots.swap(); // 左右を入れ替え
 */
const createOperationSlots = <Ids extends number>(
	operations: Record<Ids, { name: string; op: Operation }>,
	initial?: { left?: Ids | null; right?: Ids | null },
): OperationSlotsApi<Ids> => {
	// operationsからID一覧を取り出して昇順に整列
	const allIds = (Object.keys(operations) as string[])
		.map((k) => Number(k) as Ids)
		.sort((a, b) => (a as number) - (b as number));

	const [leftId, setLeftId] = createSignal<Ids | null>(initial?.left ?? null);
	const [rightId, setRightId] = createSignal<Ids | null>(
		initial?.right ?? null,
	);

	const reserveIds = createMemo<Ids[]>(() => {
		const l = leftId();
		const r = rightId();
		return allIds.filter((id) => id !== l && id !== r);
	});

	const getOp = (id: Ids) => operations[id];

	const leftOperation = createMemo(() => {
		const id = leftId();
		return id == null ? null : { id, ...getOp(id) };
	});

	const rightOperation = createMemo(() => {
		const id = rightId();
		return id == null ? null : { id, ...getOp(id) };
	});

	const reserveOperations = createMemo(() =>
		reserveIds().map((id) => ({ id, ...getOp(id) })),
	);

	// 統一移動API：id を place（left/right/reserve）へ移動する
	// - reserve: どこかに置かれていれば外す（リザーブに戻す）
	// - left/right: その位置に別IDがあれば上書き（上書きされたIDはリザーブへ）
	//               id が反対側にあれば、反対側から外してから目的地へ
	const moveTo = (id: Ids, place: OperationPlace): boolean => {
		const l = leftId();
		const r = rightId();
		const current: OperationPlace =
			l === id
				? OperationPlace.Left
				: r === id
					? OperationPlace.Right
					: OperationPlace.Reserve;

		if (place === current) return true; // 既に目的地にある

		if (place === OperationPlace.Left) {
			batch(() => {
				if (current === OperationPlace.Right) setRightId(() => null);
				// 左に別IDが入っている場合は上書き（自然にリザーブへ戻る）
				setLeftId(() => id);
			});
			return true;
		}
		if (place === OperationPlace.Right) {
			batch(() => {
				if (current === OperationPlace.Left) setLeftId(() => null);
				setRightId(() => id);
			});
			return true;
		}
    // リザーブ
		if (current === OperationPlace.Left) setLeftId(() => null);
		else if (current === OperationPlace.Right) setRightId(() => null);
		return true;
	};

	const reset = () => {
		batch(() => {
			setLeftId(() => null);
			setRightId(() => null);
		});
	};

	return {
		leftId,
		rightId,
		reserveIds,

		leftOperation,
		rightOperation,
		reserveOperations,

		moveTo,
		reset,
	};
};

const OperationSlotsContext = createContext<
	OperationSlotsApi<number> | undefined
>(undefined);

export function useOperationSlots<
	Ids extends number = number,
>(): OperationSlotsApi<Ids> {
	const ctx = useContext(OperationSlotsContext);
	if (!ctx)
		throw new Error(
			"OperationSlotsProvider が見つかりません。コンポーネントを Provider でラップしてください。",
		);
	return ctx as unknown as OperationSlotsApi<Ids>;
}

export function OperationSlotsProvider<Ids extends number>(
	props: ParentProps<{
		operations: Record<Ids, { name: string; op: Operation }>;
		initial?: { left?: Ids | null; right?: Ids | null };
	}>,
): JSX.Element {
	const slots = createOperationSlots<Ids>(props.operations, props.initial);
	return createComponent(OperationSlotsContext.Provider, {
		value: slots as unknown as OperationSlotsApi<number>,
		get children() {
			return props.children;
		},
	});
}
