import Router from 'next/router'
import { firebaseLogin } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'
import { getLoverRow } from 'common/love/lover'

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
