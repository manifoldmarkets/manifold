const a = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict'
export const nanoid = (e = 21) => {
  let t = ''
  const r = crypto.getRandomValues(new Uint8Array(e))
  for (let n = 0; n < e; n++) t += a[61 & r[n]]
  if (t.length !== e) throw new Error('Failed to generate random string')
  return t
}

// Matches the output of the randomString function, for validation purposes.
export const randomStringRegex = /^[0-9a-zA-Z]+$/
export const randomString = (length = 10) => nanoid(length)

export function genHash(str: string) {
  // xmur3

  // Route around compiler bug by using object?
  const o = { h: 1779033703 ^ str.length }

  for (let i = 0; i < str.length; i++) {
    let h = o.h
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
    o.h = h
  }
  return function () {
    let h = o.h
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

export function createRNG(seed: string) {
  // https://stackoverflow.com/a/47593316/1592933

  const gen = genHash(seed)
  let [a, b, c, d] = [gen(), gen(), gen(), gen()]

  // sfc32
  return function () {
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}

export const shuffle = (array: unknown[], rand: () => number) => {
  for (let i = 0; i < array.length; i++) {
    const swapIndex = i + Math.floor(rand() * (array.length - i))
    ;[array[i], array[swapIndex]] = [array[swapIndex], array[i]]
  }
}
