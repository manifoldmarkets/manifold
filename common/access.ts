export function isWhitelisted(email?: string) {
  return true
  // e.g. return email.endsWith('@theoremone.co') || isAdmin(email)
}

export function isAdmin(email: string) {
  const ADMINS = [
    'akrolsmir@gmail.com', // Austin
    'jahooma@gmail.com', // James
    'taowell@gmail.com', // Stephen
    'manticmarkets@gmail.com', // Manifold
  ]
  return ADMINS.includes(email)
}
