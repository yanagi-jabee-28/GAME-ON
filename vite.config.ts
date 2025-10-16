import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [tailwindcss()],
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				"GAME-DICE-1": resolve(__dirname, "GAME-DICE-1/index.html"),
				"GAME-SLOT-1": resolve(__dirname, "GAME-SLOT-1/index.html"),
				"CC-LEMON-1": resolve(__dirname, "CC-LEMON-1/index.html"),
				"GAME-pachinko-1": resolve(__dirname, "GAME-pachinko-1/index.html"),
				"NUMA-1": resolve(__dirname, "NUMA-1/index.html"),
				"Novel-games": resolve(__dirname, "Novel-games/index.html"),
				"UNDERTALE-1": resolve(__dirname, "UNDERTALE-1/index.html"),
				"UNDERTALE-2": resolve(__dirname, "UNDERTALE-2/index.html"),
				"Finger-smash-1": resolve(__dirname, "Finger-smash-1/index.html"),
				"Number-BATTLE-3": resolve(__dirname, "Number-BATTLE-3/index.html"),
				"Division-Game-1": resolve(__dirname, "Division-Game-1/index.html"),
			},
		},
	},

	// GitHub Pagesで`<USERNAME>.github.io/GAME-ON/`に公開する
	base: "/GAME-ON/",
});
