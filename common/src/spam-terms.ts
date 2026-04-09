export const VIETNAMESE_GAMBLING_TERMS = [
  'nha cai',
  'ca cuoc',
  'ty le keo',
  'xo so',
] as const

export const GAMBLING_BRAND_NAMES = [
  'alo88',
  'good88',
  'yo88',
  'go88',
  'xo88',
  'sv88',
  'uu88',
  'vic88',
  '88vv',
  'x88',
  '888new',
  '8xbet',
  '8kbet',
  'f8bet',
  '28bet',
  'pgbet',
  'ibet68',
  'win55',
  '555win',
  '68win',
  'sunwin',
  'luckywin',
  'v8club',
  'zbet',
  'vui123',
  'kubet',
  'vz99',
  'vanmay777',
  'winbox',
  'kupvip',
  'panen138',
  'xoso333',
  '55fun',
  'bl555',
  '8s1',
  'sbobet',
  '188bet',
  'fun88',
  '789bet',
  'w88',
  'bk8',
  'casino',
  'togel',
  'gacor',
  'maxwin',
  'pragmatic',
  'nohu',
] as const

export const GAMBLING_REGEXES = [
  /\d*bet\d*/i,
  /\b\w{0,4}88\b/i,
  /\bwin\d{2,3}\b/i,
  /\b\d{2,3}win\b/i,
  /\b(slot|judi|loto)\b/i,
] as const

export const DOMAIN_SUFFIX_REGEX = /(aorg|dotcom|combiz|biz|top)$/i
export const URL_REGEX = /(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/i

export function normalizeSpamText(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
