import { Architecture } from "./components/Architecture";
import { GameConsole } from "./components/GameConsole";
import { OperationDragDropBoundary } from "./components/OperationDragDropBoundary";
import { ReserveOperations } from "./components/ReserveOperations";
import { OperationSlotsProvider } from "./primitives/operationSlots";
import { OPERATIONS } from "./the-ten/config";

function App() {
	return (
		<OperationSlotsProvider operations={OPERATIONS}>
			<OperationDragDropBoundary>
				<main class="mx-auto  max-w-5xl px-8 pt-8 pb-16">
					<section class="grid gap-12 w-[stretch] max-w-3xl place-items-center mx-auto">
						<GameConsole operations={OPERATIONS} />
						<ReserveOperations class="w-full" />
					</section>
					<section class="mt-16 max-w-3xl mx-auto">
						<div class="border-t-1 border-neutral-200 p-6">
							<div class="font-medium text-lg">
								このゲームは実機でも遊べるよ！！！
							</div>
							<p class="text-neutral-500 mb-6">
								実機版（ラズパイ）とブラウザ版でゲームのプログラムを共有しています
							</p>
							<Architecture />
						</div>
					</section>
				</main>
			</OperationDragDropBoundary>
		</OperationSlotsProvider>
	);
}

export default App;
