import dotenv from 'dotenv';
import { getDomainFromURL } from './utils';
dotenv.config({ path: '../.env' });

export const PORT = process.env.PORT || 9172;

export const PUBLIC_FACING_URL = process.env.PUBLIC_FACING_URL || 'http://localhost:' + PORT;

export const TWITCH_BOT_CLIENT_ID = process.env.TWITCH_BOT_CLIENT_ID;
export const TWITCH_BOT_CLIENT_SECRET = process.env.TWITCH_BOT_CLIENT_SECRET;

export const TWITCH_BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
export const TWITCH_BOT_OAUTH_TOKEN = process.env.TWITCH_BOT_OAUTH_TOKEN;

export const TWITCH_BOT_FIREBASE_KEY = process.env.TWITCH_BOT_FIREBASE_KEY;

export const TARGET = process.env.TARGET || 'LOCAL';

export const IS_DEV = PUBLIC_FACING_URL.indexOf('localhost') > 0;

const MANIFOLD_URLS = {
  PROD: 'https://manifold.markets/',
  DEV: 'https://dev.manifold.markets/',
  PR_DEV: 'https://dev-git-twitch-prerelease-mantic.vercel.app/',
  LOCAL: 'http://localhost:3000/',
};
export const MANIFOLD_DB_LOCATION = getDomainFromURL(TARGET === 'PROD' ? MANIFOLD_URLS['PROD'] : MANIFOLD_URLS['DEV']);
export const MANIFOLD_API_BASE_URL = MANIFOLD_URLS[TARGET] + 'api/v0/';
export const MANIFOLD_SIGNUP_URL = MANIFOLD_URLS[TARGET] + 'twitch';
