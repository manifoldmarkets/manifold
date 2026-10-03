import { CheckCircleIcon, SparklesIcon } from '@heroicons/react/outline'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import {
  JOB_INTEREST_LABELS,
  JOB_INTERESTS,
  JOB_REGION_LABELS,
  JOB_REGIONS,
  JOB_SKILL_LABELS,
  JOB_SKILLS,
  JobInterest,
  JobRegion,
  JobSkill,
} from 'common/job-seeker'
import { Button } from 'web/components/buttons/button'
import { PillButton } from 'web/components/buttons/pill-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'

const toggle = <T,>(arr: T[], v: T) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

export function JobInterestCard() {
  const user = useUser()
  const { data, refresh } = useAPIGetter(
    'get-job-interest',
    {},
    undefined,
    undefined,
    !!user
  )
  const interest = data?.interest
  // "Registered" means actively on the list. A user who opted out keeps their
  // row (so re-joining pre-fills), but openToContact is false — treat them as
  // not registered so they see the join CTA again.
  const registered = !!interest && interest.openToContact

  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState<JobSkill[]>([])
  const [interests, setInterests] = useState<JobInterest[]>([])
  const [region, setRegion] = useState<JobRegion | null>(null)
  const [saving, setSaving] = useState(false)

  // Sync the form with the saved row whenever it loads or changes.
  useEffect(() => {
    if (interest) {
      setSkills(interest.skills)
      setInterests(interest.interests)
      setRegion(interest.region)
    }
  }, [interest])

  const save = async () => {
    setSaving(true)
    try {
      await api('set-job-interest', {
        skills,
        interests,
        region,
        openToContact: true,
      })
      await refresh()
      setOpen(false)
      toast.success(registered ? 'Preferences updated' : "You're on the list!")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // Discard in-progress edits and snap the form back to the saved row.
  const cancel = () => {
    setSkills(interest?.skills ?? [])
    setInterests(interest?.interests ?? [])
    setRegion(interest?.region ?? null)
    setOpen(false)
  }

  // Opt out without deleting the row (openToContact=false), so their prior
  // picks are still there if they choose to re-join later.
  const remove = async () => {
    if (!interest) return
    setSaving(true)
    try {
      await api('set-job-interest', {
        skills: interest.skills,
        interests: interest.interests,
        region: interest.region,
        openToContact: false,
      })
      await refresh()
      toast.success('Removed — you can re-join anytime')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const canSave = skills.length > 0 || interests.length > 0

  // Summary chips reflect the *saved* row, never in-progress edits.
  const chips = interest
    ? [
        ...interest.skills.map((s) => JOB_SKILL_LABELS[s]),
        ...interest.interests.map((i) => JOB_INTEREST_LABELS[i]),
        ...(interest.region ? [JOB_REGION_LABELS[interest.region]] : []),
      ]
    : []

  // Registered and not editing → show the saved preferences.
  if (registered && !open) {
    return (
      <div className="border-primary-200 bg-primary-50/50 rounded-2xl border p-5 dark:border-indigo-400/30 dark:bg-indigo-500/10">
        <Col className="gap-3">
          <CheckCircleIcon
            className="text-primary-600 h-6 w-6 dark:text-indigo-300"
            aria-hidden
          />
          <h2 className="text-ink-1000 text-base font-semibold dark:text-slate-100">
            You're on the list
          </h2>

          <Col className="gap-3">
            <p className="text-ink-600 text-sm leading-relaxed dark:text-slate-300">
              We may reach out when a relevant opportunity comes along.
            </p>
            <Row className="flex-wrap gap-1.5">
              {chips.map((label) => (
                <span
                  key={label}
                  className="bg-ink-100 text-ink-700 rounded-full px-2.5 py-0.5 text-xs dark:bg-slate-700/50 dark:text-slate-300"
                >
                  {label}
                </span>
              ))}
            </Row>
            <Row className="flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-primary-600 hover:text-primary-700 focus-visible:ring-primary-500 rounded text-sm font-medium focus:outline-none focus-visible:ring-2 dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                Update preferences
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="text-ink-500 hover:text-ink-700 focus-visible:ring-primary-500 rounded text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Remove me
              </button>
            </Row>
          </Col>
        </Col>
      </div>
    )
  }

  return (
    <div className="border-primary-200 bg-primary-50/50 rounded-2xl border p-5 dark:border-indigo-400/30 dark:bg-indigo-500/10">
      <div className="bg-canvas-0 text-primary-600 mb-4 flex h-10 w-10 items-center justify-center rounded-xl dark:bg-slate-800/60 dark:text-indigo-300">
        <SparklesIcon className="h-5 w-5" aria-hidden />
      </div>
      <Col className="gap-2">
        <h2 className="text-ink-1000 text-base font-semibold dark:text-slate-100">
          Let your next role find you
        </h2>
        <p className="text-ink-600 text-sm leading-relaxed dark:text-slate-300">
          Share your strengths and interests. We'll aim to connect you with
          employers in the community and may notify you of relevant roles.
        </p>
      </Col>

      {!user ? (
        <Button
          className="mt-5 w-full dark:bg-indigo-600 dark:hover:bg-indigo-700"
          color="indigo"
          onClick={() => firebaseLogin()}
        >
          Sign in to get started
        </Button>
      ) : !open ? (
        <Button
          color="indigo"
          className="mt-5 w-full dark:bg-indigo-600 dark:hover:bg-indigo-700"
          onClick={() => setOpen(true)}
        >
          Register interest
        </Button>
      ) : (
        <Col className="border-primary-100 mt-4 gap-5 border-t pt-4 dark:border-indigo-400/20">
          <Col className="gap-2">
            <span className="text-ink-500 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
              Your strengths
            </span>
            <Row className="flex-wrap gap-2">
              {JOB_SKILLS.map((s) => (
                <PillButton
                  key={s}
                  selected={skills.includes(s)}
                  onSelect={() => setSkills((a) => toggle(a, s))}
                  className="h-8 px-3"
                >
                  {JOB_SKILL_LABELS[s]}
                </PillButton>
              ))}
            </Row>
          </Col>

          <Col className="gap-2">
            <span className="text-ink-500 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
              Interested in
            </span>
            <Row className="flex-wrap gap-2">
              {JOB_INTERESTS.map((i) => (
                <PillButton
                  key={i}
                  selected={interests.includes(i)}
                  onSelect={() => setInterests((a) => toggle(a, i))}
                  className="h-8 px-3"
                >
                  {JOB_INTEREST_LABELS[i]}
                </PillButton>
              ))}
            </Row>
          </Col>

          <Col className="gap-2">
            <span className="text-ink-500 text-xs font-semibold uppercase tracking-wide dark:text-slate-400">
              Based in (optional)
            </span>
            <Row className="flex-wrap gap-2">
              {JOB_REGIONS.map((r) => (
                <PillButton
                  key={r}
                  selected={region === r}
                  onSelect={() => setRegion((cur) => (cur === r ? null : r))}
                  className="h-8 px-3"
                >
                  {JOB_REGION_LABELS[r]}
                </PillButton>
              ))}
            </Row>
          </Col>

          <Row className="flex-wrap items-center gap-4">
            <Button
              color="indigo"
              className="dark:enabled:bg-indigo-600 dark:enabled:hover:bg-indigo-700"
              loading={saving}
              disabled={!canSave}
              onClick={save}
            >
              {registered ? 'Save changes' : "I'm interested"}
            </Button>
            <button
              type="button"
              onClick={cancel}
              className="text-ink-500 hover:text-ink-700 focus-visible:ring-primary-500 rounded text-sm focus:outline-none focus-visible:ring-2 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Cancel
            </button>
          </Row>
        </Col>
      )}
    </div>
  )
}
