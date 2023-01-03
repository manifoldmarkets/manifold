import fetch from 'node-fetch';

export function getParamsFromURL(url: string) {
  const q = url.split('?');
  const result = {};
  if (q.length >= 2) {
    q[1].split('&').forEach((item) => {
      try {
        result[item.split('=')[0]] = item.split('=')[1];
      } catch (e) {
        result[item.split('=')[0]] = '';
      }
    });
  }
  return result;
}

export function buildURL(baseURL: string, params: { [k: string]: unknown }) {
  const paramString = Object.keys(params)
    .map((key) => key + '=' + params[key])
    .join('&');
  return `${baseURL}?${paramString}`;
}

// From https://stackoverflow.com/questions/8498592/extract-hostname-name-from-string
export function getDomainFromURL(url: string) {
  const matches = url.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
  return matches && matches[1]; // will be null if no match is found
}

export async function detectGCloudInstance(): Promise<string> {
  return fetch('http://metadata.google.internal/computeMetadata/v1/instance/id', { headers: { 'Metadata-Flavor': 'Google' } })
    .then(async (r) => {
      const id = await r.text();
      return id;
    })
    .catch(() => undefined);
}

const timers: { [k: string]: number } = {};
export const ts = function (name: string) {
  timers[name] = Date.now();
};
export const te = function (name: string) {
  return ((Date.now() - timers[name]) * 0.001).toFixed(1) + 's';
};
