import fetch from 'node-fetch';
import { TWITCH_BOT_CLIENT_SECRET, TWITCH_BOT_CLIENT_ID } from './envs';
import log from './logger';

export type TwitchUser = {
  broadcaster_type: 'partner' | 'affiliate' | '';
  description: string;
  display_name: string;
  id: string;
  login: string;
  offline_image_url: string;
  profile_image_url: string;
  type: string;
  view_count: number;
  email: string;
  created_at: string;
};

export async function getTwitchDetailsFromLinkCode(code: string): Promise<TwitchUser> {
  const grantType = 'authorization_code';
  const redirectURI = 'https://4c536eec-3268-4a41-b226-ebb590ca2a09'; // Special URL registered in Twitch app to allow auth
  const queryString = `client_id=${TWITCH_BOT_CLIENT_ID}&client_secret=${TWITCH_BOT_CLIENT_SECRET}&code=${code}&grant_type=${grantType}&redirect_uri=${redirectURI}`;

  let raw = await fetch(`https://id.twitch.tv/oauth2/token?${queryString}`, { method: 'POST' });
  let json = await raw.json();

  const accessToken = json['access_token'];
  if (!accessToken) {
    log.error(json);
    throw new Error('Failed to fetch access token.');
  }

  raw = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      'Client-Id': TWITCH_BOT_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  json = await raw.json();
  return <TwitchUser>json['data'][0];
}

export function sanitizeTwitchChannelName(channel: string) {
  channel = channel.toLocaleLowerCase();
  if (channel.startsWith('#')) {
    channel = channel.substring(1);
  }
  return channel;
}
