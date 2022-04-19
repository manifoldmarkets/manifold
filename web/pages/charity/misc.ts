export const manaTo$ = (mana: number) =>
  (mana / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
