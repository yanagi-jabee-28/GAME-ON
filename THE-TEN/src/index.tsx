/* @refresh reload */
import { render } from "solid-js/web";
import "./assets/DSEG7Modern-LightItalic.woff2?url"
import "./style.css";
import App from "./App";

const root = document.getElementById("root");

// rootが存在しない場合はエラーをスローする
if (!root) {
	throw new Error("Root element not found");
}

render(() => <App />, root);
