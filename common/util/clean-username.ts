export const cleanUsername = (name: string) => {
  return name
    .replace(/\s+/g, '')
    .normalize('NFD') // split an accented letter in the base letter and the acent
    .replace(/[\u0300-\u036f]/g, '') // remove all previously split accents
    .replace(/[^A-Za-z0-9_]/g, '') // remove all chars not letters, numbers and underscores
}
