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

export const DEBUG_TWITCH_ACCOUNT = process.env.DEBUG_TWITCH_ACCOUNT;

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

export const MANIFOLD_FIREBASE_CONFIG =
  TARGET === 'PROD'
    ? {
        apiKey: 'AIzaSyDp3J57vLeAZCzxLD-vcPaGIkAmBoGOSYw',
        authDomain: 'mantic-markets.firebaseapp.com',
        projectId: 'mantic-markets',
        region: 'us-central1',
        storageBucket: 'mantic-markets.appspot.com',
        messagingSenderId: '128925704902',
        appId: '1:128925704902:web:f61f86944d8ffa2a642dc7',
        measurementId: 'G-SSFK1Q138D',
      }
    : {
        apiKey: 'AIzaSyBoq3rzUa8Ekyo3ZaTnlycQYPRCA26VpOw',
        authDomain: 'dev-mantic-markets.firebaseapp.com',
        projectId: 'dev-mantic-markets',
        region: 'us-central1',
        storageBucket: 'dev-mantic-markets.appspot.com',
        messagingSenderId: '134303100058',
        appId: '1:134303100058:web:27f9ea8b83347251f80323',
        measurementId: 'G-YJC9E37P37',
      };
