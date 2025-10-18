import { GameConsole } from "./components/GameConsole";
import { ReserveOperations } from "./components/ReserveOperations";
import { OperationDragDropBoundary } from "./components/OperationDragDropBoundary";
import { OperationSlotsProvider } from "./primitives/operationSlots";
import { OPERATIONS } from "./the-ten/config";

function App() {
	return (
		<OperationSlotsProvider operations={OPERATIONS}>
			<OperationDragDropBoundary>
				<main class="mx-auto  max-w-5xl px-8 pt-8 pb-16">
					<div class="grid gap-12 w-[stretch] max-w-3xl place-items-center mx-auto">
						<GameConsole operations={OPERATIONS} />
						<ReserveOperations class="w-full"/>
					</div>
				</main>
			</OperationDragDropBoundary>
		</OperationSlotsProvider>
	);
}

export default App;
