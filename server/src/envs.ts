import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

export const PUBLIC_FACING_URL = process.env.PUBLIC_FACING_URL || "http://localhost:9172";

export const TWTICH_APP_CLIENT_ID = process.env.TWTICH_APP_CLIENT_ID;
export const TWITCH_APP_CLIENT_SECRET = process.env.TWITCH_APP_CLIENT_SECRET;

export const TWITCH_BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
export const TWITCH_BOT_OAUTH_TOKEN = process.env.TWITCH_BOT_OAUTH_TOKEN;

export const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

export const MANIFOLD_API_BASE_URL = "http://localhost:3000/api/v0/";//"https://dev.manifold.markets/api/v0/";