import { User } from 'web/lib/firebase/users'

export const useSaveReferral = (
  user: User | null | undefined,
  options?: {
    defaultReferrerUsername?: string
    contractId?: string
  }
) => {}
