import Router from 'next/router'
import { firebaseLogin } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'
import { getLoverRow } from 'common/love/lover'
import { api } from 'web/lib/firebase/api'
import { MARKET_VISIT_BONUS, MARKET_VISIT_BONUS_TOTAL } from 'common/economy'

export const signupThenMaybeRedirectToSignup = async () => {
  const creds = await firebaseLogin()
  const userId = creds?.user.uid
  if (userId) {
    const lover = await getLoverRow(userId, db)
    if (!lover) {
      await Router.push('/signup')
    }
  }
}

export const requestAllSignupBonuses = async () => {
  const numRequests = MARKET_VISIT_BONUS_TOTAL / MARKET_VISIT_BONUS
  for (let i = 0; i < numRequests; i++) {
    await api('request-signup-bonus', {})
  }
}
