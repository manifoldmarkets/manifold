export const randomString = (length = 12) =>
  Math.random()
    .toString(16)
    .substring(2, length + 2)

export function genHash(str: string) {
  // xmur3
  let h: number
  for (let i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function () {
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
    const swapIndex = Math.floor(rand() * (array.length - i))
    ;[array[i], array[swapIndex]] = [array[swapIndex], array[i]]
  }
}
