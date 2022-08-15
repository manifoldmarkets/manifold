import { exit } from "process";
import App from "./app";
import log from "./logger";

const app = new App();
try {
    await app.launch();
} catch (e) {
    log.trace(e);
    exit(1);
}