import Router from 'next/router'
import { firebaseLogin } from 'web/lib/firebase/users'
import { getLoverRow } from '../supabase/lovers'

export const signupThenMaybeRedirectToSignup = async () => {
  const creds = await firebaseLogin()
  const userId = creds?.user.uid
  if (userId) {
    const lover = await getLoverRow(userId)
    if (!lover) {
      await Router.push('/signup')
    }
  }
}
