export function identifyUser(userId: string) {
  ;(window as any)?.heap?.identify(userId)
}
