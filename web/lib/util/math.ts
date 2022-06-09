// xth triangle number * 5  =  5 + 10 + 15 + ... + (x * 5)
export const quad = (x: number) => (5 / 2) * x * (x + 1)

// inverse (see https://math.stackexchange.com/questions/2041988/how-to-get-inverse-of-formula-for-sum-of-integers-from-1-to-nsee )
export const invQuad = (y: number) => Math.sqrt((2 / 5) * y + 1 / 4) - 1 / 2
