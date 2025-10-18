// SolidJSのディレクティブ型定義
declare module "solid-js" {
	namespace JSX {
		interface Directives {
			// biome-ignore lint/suspicious/noExplicitAny: solid-dnd directive type is complex
			draggable: any;
			// biome-ignore lint/suspicious/noExplicitAny: solid-dnd directive type is complex
			droppable: any;
		}
	}
}

export {};
