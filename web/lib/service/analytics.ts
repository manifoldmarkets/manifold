export function identifyUser(userId: string) {
  const w = window as any // needed to stop weird prettier/eslint conflict
  w?.heap?.identify(userId)
}
