/// <reference types="vite/client" />

declare module "vite/client" {
	interface ImportMetaEnv {
		readonly [key: string]: string | boolean | undefined;
	}

	interface ImportMeta {
		readonly env: ImportMetaEnv;
		readonly hot?: ViteHotContext;
	}

	interface ViteHotContext {
		readonly data: any;
		accept(): void;
		accept(cb: (mod: any) => void): void;
		accept(dep: string, cb: (mod: any) => void): void;
		accept(deps: readonly string[], cb: (mods: any[]) => void): void;
		dispose(cb: (data: any) => void): void;
		decline(): void;
		invalidate(): void;
		on<T extends string>(event: T, cb: (payload: any) => void): void;
		send<T extends string>(event: T, data?: any): void;
	}
}
