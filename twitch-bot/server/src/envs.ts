import dotenv from 'dotenv';
import { getDomainFromURL } from './utils';
import { DEV_CONFIG } from '@manifold_common/envs/dev';
import { PROD_CONFIG } from '@manifold_common/envs/prod';
dotenv.config({ path: '../.env' });

export const PORT = Number.parseInt(process.env.PORT) || 9172;

export const PUBLIC_FACING_URL = process.env.PUBLIC_FACING_URL || 'http://localhost:' + PORT;

export const TWITCH_BOT_CLIENT_ID = process.env.TWITCH_BOT_CLIENT_ID;
export const TWITCH_BOT_CLIENT_SECRET = process.env.TWITCH_BOT_CLIENT_SECRET;

export const TWITCH_BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
export const TWITCH_BOT_OAUTH_TOKEN = process.env.TWITCH_BOT_OAUTH_TOKEN;

export const TWITCH_BOT_FIREBASE_KEY = process.env.TWITCH_BOT_FIREBASE_KEY;

export const TARGET = process.env.TARGET || 'DEV';

export const DEBUG_TWITCH_ACCOUNT = process.env.DEBUG_TWITCH_ACCOUNT;

export const IS_DEV = PUBLIC_FACING_URL.indexOf('localhost') > 0;

export const MANIFOLD_URLS = {
  PROD: 'https://manifold.markets/',
  DEV: 'https://dev.manifold.markets/',
  PR_DEV: 'https://dev-git-twitch-prerelease-mantic.vercel.app/',
  LOCAL: 'http://localhost:3000/',
};
export const MANIFOLD_DB_LOCATION = getDomainFromURL(TARGET === 'PROD' ? MANIFOLD_URLS['PROD'] : MANIFOLD_URLS['DEV']);
export const MANIFOLD_API_BASE_URL = MANIFOLD_URLS[TARGET] + 'api/v0/';
export const MANIFOLD_SIGNUP_URL = MANIFOLD_URLS[TARGET] + 'twitch';

export const MANIFOLD_FIREBASE_CONFIG = TARGET === 'PROD' ? PROD_CONFIG.firebaseConfig : DEV_CONFIG.firebaseConfig;

export const GOOGLE_PROJECT_ID = 'mantic-markets';
export const GOOGLE_LOG_NAME = 'bot-' + TARGET;
