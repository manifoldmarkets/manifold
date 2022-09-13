import dotenv from "dotenv";
import { getDomainFromURL } from "./utils";
dotenv.config({ path: "../.env" });

export const PORT = process.env.PORT || 9172;

export const PUBLIC_FACING_URL = process.env.PUBLIC_FACING_URL || ("http://localhost:" + PORT);

export const TWTICH_APP_CLIENT_ID = process.env.TWTICH_APP_CLIENT_ID;
export const TWITCH_APP_CLIENT_SECRET = process.env.TWITCH_APP_CLIENT_SECRET;

export const TWITCH_BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
export const TWITCH_BOT_OAUTH_TOKEN = process.env.TWITCH_BOT_OAUTH_TOKEN;

export const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

export const TARGET = process.env.TARGET || "LOCAL";

export const IS_DEV = PUBLIC_FACING_URL.indexOf("localhost") > 0;

const MANIFOLD_URLS = {
    PROD: "https://manifold.markets/",
    DEV: "https://dev.manifold.markets/",
    PR_DEV: "https://dev-git-twitch-linking-mantic.vercel.app/",
    LOCAL: "http://localhost:3000/",
};
export const MANIFOLD_DB_LOCATION = getDomainFromURL(TARGET === "PROD" ? MANIFOLD_URLS["PROD"] : MANIFOLD_URLS["DEV"]);
export const MANIFOLD_API_BASE_URL = MANIFOLD_URLS[TARGET] + "api/v0/";
export const MANIFOLD_SIGNUP_URL = MANIFOLD_URLS[TARGET] + "twitch";