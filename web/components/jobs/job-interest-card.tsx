import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
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
  const [collapsed, setCollapsed] = useState(true)
  // Separate from `collapsed`, which belongs to the registered-state panel.
  // Starts expanded: an unregistered visitor hasn't seen the pitch yet.
  const [pitchCollapsed, setPitchCollapsed] = useState(false)
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
      setCollapsed(false) // show their saved tags as confirmation
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

  // Registered and not editing → a collapsible summary panel.
  if (registered && !open) {
    return (
      <div className="border-primary-200 bg-canvas-0 dark:border-primary-800 rounded-xl border p-4 sm:p-5">
        <Col className="gap-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="focus-visible:ring-primary-500 flex w-full cursor-pointer items-center justify-between gap-3 rounded text-left focus:outline-none focus-visible:ring-2"
            aria-expanded={!collapsed}
          >
            <h3 className="text-ink-1000 text-base font-semibold sm:text-lg">
              You're on the list for new roles
            </h3>
            <span className="text-primary-600 flex shrink-0 items-center gap-1 text-sm font-semibold">
              {collapsed ? 'Show' : 'Hide'}
              {collapsed ? (
                <ChevronDownIcon className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronUpIcon className="h-4 w-4" aria-hidden />
              )}
            </span>
          </button>

          {!collapsed && (
            <Col className="gap-3">
              <Row className="flex-wrap gap-1.5">
                {chips.map((label) => (
                  <span
                    key={label}
                    className="bg-ink-100 text-ink-700 rounded-full px-2.5 py-0.5 text-xs"
                  >
                    {label}
                  </span>
                ))}
              </Row>
              <Row className="items-center gap-4">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="text-primary-600 hover:text-primary-700 focus-visible:ring-primary-500 rounded text-sm font-medium focus:outline-none focus-visible:ring-2"
                >
                  Update preferences
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={saving}
                  className="text-ink-500 hover:text-ink-700 focus-visible:ring-primary-500 rounded text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-50"
                >
                  Remove me
                </button>
              </Row>
            </Col>
          )}
        </Col>
      </div>
    )
  }

  return (
    <div className="border-primary-200 bg-canvas-0 dark:border-primary-800 rounded-xl border p-4 sm:p-5">
      <Col className="gap-2">
        {open ? (
          <h3 className="text-ink-1000 text-lg font-semibold">
            Looking for a role? Let employers reach you
          </h3>
        ) : (
          <button
            type="button"
            onClick={() => setPitchCollapsed((c) => !c)}
            className="focus-visible:ring-primary-500 flex w-full cursor-pointer items-center justify-between gap-3 rounded text-left focus:outline-none focus-visible:ring-2"
            aria-expanded={!pitchCollapsed}
          >
            <h3 className="text-ink-1000 text-base font-semibold sm:text-lg">
              Looking for a role? Let employers reach you
            </h3>
            <span className="text-primary-600 flex shrink-0 items-center gap-1 text-sm font-semibold">
              {pitchCollapsed ? 'Show' : 'Hide'}
              {pitchCollapsed ? (
                <ChevronDownIcon className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronUpIcon className="h-4 w-4" aria-hidden />
              )}
            </span>
          </button>
        )}
        {!pitchCollapsed && (
          <p className="text-ink-600 max-w-2xl text-base leading-relaxed">
            Tag your strengths and what you're after. We'll aim to connect you
            with employers hiring from the community, and may notify you of
            relevant postings.
          </p>
        )}
      </Col>

      {pitchCollapsed ? null : !user ? (
        <Button className="mt-4" color="indigo" onClick={() => firebaseLogin()}>
          Sign in to register interest
        </Button>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-primary-600 hover:text-primary-700 focus-visible:ring-primary-500 mt-3 self-start rounded text-sm font-semibold focus:outline-none focus-visible:ring-2"
        >
          Register interest →
        </button>
      ) : (
        <Col className="border-primary-100 mt-4 gap-5 border-t pt-4">
          <Col className="gap-2">
            <span className="text-ink-500 font-mono text-xs uppercase tracking-widest">
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
            <span className="text-ink-500 font-mono text-xs uppercase tracking-widest">
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
            <span className="text-ink-500 font-mono text-xs uppercase tracking-widest">
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
              loading={saving}
              disabled={!canSave}
              onClick={save}
            >
              {registered ? 'Save changes' : "I'm interested"}
            </Button>
            <button
              type="button"
              onClick={cancel}
              className="text-ink-500 hover:text-ink-700 focus-visible:ring-primary-500 rounded text-sm focus:outline-none focus-visible:ring-2"
            >
              Cancel
            </button>
          </Row>
        </Col>
      )}
    </div>
  )
}
