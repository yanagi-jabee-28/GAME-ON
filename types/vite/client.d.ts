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
		readonly data: Record<string, unknown>;
		accept(): void;
		accept(cb: (mod: unknown) => void): void;
		accept(dep: string, cb: (mod: unknown) => void): void;
		accept(deps: readonly string[], cb: (mods: unknown[]) => void): void;
		dispose(cb: (data: Record<string, unknown>) => void): void;
		decline(): void;
		invalidate(): void;
		on<T extends string>(event: T, cb: (payload: unknown) => void): void;
		send<T extends string>(event: T, data?: unknown): void;
	}
}
