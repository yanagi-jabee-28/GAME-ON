import {
	add,
	divide,
	multiply,
	type Operation,
	subtract,
} from "./logic/calculation";

export const PIN_NUMS_DISPLAY_CLK = 0;
export const PIN_NUMS_DISPLAY_DIO = 1;

export const PIN_LEFT_OP_REED1 = 6;
export const PIN_LEFT_OP_REED2 = 7;
export const PIN_LEFT_OP_REED3 = 8;

export const PIN_RIGHT_OP_REED1 = 10;
export const PIN_RIGHT_OP_REED2 = 11;
export const PIN_RIGHT_OP_REED3 = 12;

export const PIN_BUTTON = 18;

export const PIN_CORRECT_LED = 20;
export const PIN_WRONG_LED = 19;

export const OPERATIONS: Record<number, {
	name: string;
	op: Operation;
}> = {
	1: { name: "ADD", op: add }, // 0b001
	2: { name: "SUBTRACT", op: subtract }, // 0b010
	4: { name: "MULTIPLY", op: multiply }, // 0b100
	5: { name: "DIVIDE", op: divide }, // 0b101
};
