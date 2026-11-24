import Image from 'next/image'
import { FormEvent, useRef, useState } from 'react'

import { TRADE_TERM } from 'common/envs/constants'
import type { User } from 'common/user'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { randomString } from 'common/util/random'
import {
  isPermanentReferralError,
  normalizeReferrerInput,
} from 'common/welcome-flow'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { APIError, updateUser } from 'web/lib/api/api'
import {
  canSetReferrer,
  clearCachedReferralInfo,
  getCachedReferralInfo,
  sendReferral,
  writeReferralInfo,
} from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'

export function WelcomeIntro({
  user,
  onNext,
  nextLabel,
}: {
  user: User
  onNext: () => void | Promise<void>
  nextLabel: string
}) {
  const savedIdentity = useRef<{ name: string; username?: string }>({
    name: user.name,
    username: user.username,
  })
  const nameSave = useRef<Promise<string | undefined>>(
    Promise.resolve(undefined)
  )
  const [name, setName] = useState(user.name)
  const [cached] = useState(getCachedReferralInfo)
  const prefilled = !!cached?.explicit
  const [referrer, setReferrer] = useState(prefilled ? cached.username : '')
  const [expanded, setExpanded] = useState(prefilled)
  const [referralSent, setReferralSent] = useState(false)
  const [referralError, setReferralError] = useState('')
  const [nameError, setNameError] = useState('')
  const [busy, setBusy] = useState(false)

  const persistName = async (newName: string) => {
    if (
      newName === savedIdentity.current.name &&
      savedIdentity.current.username
    )
      return savedIdentity.current.username
    if (newName !== savedIdentity.current.name) {
      await updateUser({ name: newName })
      savedIdentity.current = { name: newName }
    }
    const cleaned = cleanUsername(newName)
    let username: string
    try {
      username = (await updateUser({ username: cleaned })).username
    } catch (error) {
      console.error(error)
      username = (
        await updateUser({ username: cleaned.slice(0, 20) + randomString(5) })
      ).username
    }
    savedIdentity.current = { name: newName, username }
    return username
  }

  // Blur and submit can happen in the same click. Save edits in order so the
  // referral sees the final username, including a fallback from an earlier save.
  const saveName = () => {
    const newName = cleanDisplayName(name) || 'User'
    setName(newName)
    const result = nameSave.current.then(() => persistName(newName))
    nameSave.current = result.catch(() => undefined)
    return result
  }

  const saveReferral = async (ownUsername: string) => {
    if (referralSent || !canSetReferrer(user)) return true
    const username = normalizeReferrerInput(referrer)
    const report = (
      result: 'ok' | 'self' | 'not-found' | 'error' | 'cleared'
    ) => track('onboarding referral entered', { result, prefilled })
    const currentReferral = getCachedReferralInfo()
    if (!username) {
      if (currentReferral?.explicit) {
        clearCachedReferralInfo()
        report('cleared')
      }
      return true
    }

    if (username.toLowerCase() === ownUsername.toLowerCase()) {
      setReferralError("You can't refer yourself")
      report('self')
      return false
    }

    const contractId =
      currentReferral?.explicit && currentReferral.username === username
        ? currentReferral.contractId
        : undefined
    try {
      await sendReferral(username, contractId)
      setReferralSent(true)
      report('ok')
    } catch (error) {
      if (error instanceof APIError && isPermanentReferralError(error.code)) {
        if (error.code === 404) {
          setReferralError(
            `We couldn't find @${username}. Check the spelling, or leave it blank.`
          )
          report('not-found')
          return false
        }
        if (getCachedReferralInfo()?.username === username)
          clearCachedReferralInfo()
      } else {
        writeReferralInfo(username, { explicitReferrer: username, contractId })
      }
      console.error('Could not send onboarding referral', error)
      report('error')
    }
    return true
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setNameError('')
    setReferralError('')
    try {
      const ownUsername = await saveName()
      if (await saveReferral(ownUsername)) await onNext()
    } catch (error) {
      console.error('Could not save onboarding name', error)
      setNameError("We couldn't save your name. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
      <div className="min-h-0 space-y-4 overflow-y-auto">
        <Image src="/logo.svg" alt="" width={44} height={44} />
        <h2 className="text-2xl font-semibold">Welcome to Manifold!</h2>
        <p className="text-ink-700">
          Use play money to {TRADE_TERM} on politics, tech, sports, and more for
          a chance to win real cash prizes.
        </p>
        <div>
          <label htmlFor="display-name" className="mb-1 block font-semibold">
            What should we call you?
          </label>
          <Input
            id="display-name"
            value={name}
            maxLength={30}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              void saveName().catch(console.error)
            }}
            className="w-full"
            placeholder="Enter your name"
            data-cy="onboarding-name-input"
          />
          {nameError && (
            <p className="text-scarlet-600 mt-1 text-sm" role="alert">
              {nameError}
            </p>
          )}
        </div>
        {canSetReferrer(user) &&
          !referralSent &&
          (expanded ? (
            <div>
              <label htmlFor="invited-by" className="mb-1 block font-semibold">
                Invited by
              </label>
              <div className="relative">
                <span
                  aria-hidden
                  className="text-ink-500 pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center"
                >
                  @
                </span>
                <Input
                  id="invited-by"
                  className="w-full pl-8"
                  value={referrer}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="username"
                  disabled={busy}
                  error={!!referralError}
                  aria-invalid={!!referralError}
                  aria-describedby={
                    referralError ? 'invited-by-error' : undefined
                  }
                  onChange={(event) => {
                    setReferrer(event.target.value)
                    setReferralError('')
                  }}
                />
              </div>
              {referralError && (
                <p
                  id="invited-by-error"
                  role="alert"
                  className="text-scarlet-600 mt-1 text-sm"
                >
                  {referralError}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="text-primary-600 text-sm hover:underline"
              onClick={() => setExpanded(true)}
              disabled={busy}
            >
              Invited by a friend?
            </button>
          ))}
      </div>
      <Button type="submit" className="shrink-0 self-end" loading={busy}>
        {nextLabel}
      </Button>
    </form>
  )
}
