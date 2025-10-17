import type { IReedSwitch } from "../hardware";
import type { Operation } from "../logic/calculation";
import { toBinaryString } from "../utils/binary";

export type OperationInput = ValidInput | InvalidInput;

export interface ValidInput {
	success: true;
	value: number;
	operation: Operation;
}

export interface InvalidInput {
	success: false;
	value: number;
}

export interface IOperationReader {
	read: () => OperationInput;
}

/**
 * 3つのリードスイッチから演算を読み取る
 */
export class OperationReader implements IOperationReader {
		private readonly reed1: IReedSwitch;
		private readonly reed2: IReedSwitch;
		private readonly reed3: IReedSwitch;

		private readonly operations: Record<
			number,
			{
				name: string;
				op: Operation;
			}
		>;

		constructor(
			{
				reed1,
				reed2,
				reed3,
			}: { reed1: IReedSwitch; reed2: IReedSwitch; reed3: IReedSwitch },
			operations: Record<
				number,
				{
					name: string;
					op: Operation;
				}
			>,
		) {
			this.reed1 = reed1;
			this.reed2 = reed2;
			this.reed3 = reed3;
			this.operations = operations;
		}

		read(): OperationInput {
			const value =
				(this.reed1.read() << 2) | (this.reed2.read() << 1) | this.reed3.read();

			// 演算が存在しない場合
			if (value in this.operations === false) {
				const result: InvalidInput = { success: false, value };
				console.log(this.formatDebugInfo(result));
				return result;
			}

			const operation = this.operations[value].op;
			const result: ValidInput = { success: true, value, operation };
			console.log(this.formatDebugInfo(result));
			return result;
		}

		private formatDebugInfo(input: OperationInput){
				const valueBits = 3;
				if (input.success === false) {
					return `err ${toBinaryString(input.value, valueBits)}`;
				}

				const operationName = this.operations[input.value]?.name ?? "unknown";

				return `${operationName} ${toBinaryString(input.value, valueBits)}`;
		}
	}
