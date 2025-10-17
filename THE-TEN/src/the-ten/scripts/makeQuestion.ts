// Picoの負荷を減らすために、事前に問題を作成しておく
// quiz.ts にハードコードする
// npx tsx src/scripts/makeQuestion.ts

import {
	add,
	calculate3Numbers,
	divide,
	multiply,
	type Operation,
	subtract,
} from "../logic/calculation";
import type { Question } from "../logic/quiz";

const operations: Operation[] = [add, subtract, multiply, divide];
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const numbers = [...Array(10)].map((_, i) => i);

function validateQuestion(
	a: number,
	b: number,
	c: number,
	op1: Operation,
	op2: Operation,
) {
	if (op1 === op2) {
		return false;
	}

	return calculate3Numbers(a, b, c, op1, op2) === 10;
}

const questions: Question[] = [];
for (const a of numbers) {
	for (const b of numbers) {
		for (const c of numbers) {
			operationsLoop: for (const op1 of operations) {
				for (const op2 of operations) {
					if (validateQuestion(a, b, c, op1, op2)) {
						questions.push([a, b, c]);

						// 同じ数字の組み合わせはスキップする
						break operationsLoop;
					}
				}
			}
		}
	}
}

// 要素数が多いので、直接console.log(questions)すると全部表示されない
// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
console.log("[", ...questions.map((q) => `[${q}],`), "]");
