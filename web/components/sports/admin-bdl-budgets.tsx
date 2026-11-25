import { API } from 'common/api/schema'
import { ComponentProps, FormEvent, useRef } from 'react'
import {
  BDL_LEAGUES,
  BDL_LEAGUE_KEYS,
  BdlLeagueKey,
  isBdlLeagueKey,
} from 'common/bdl/leagues'
import {
  StoredMajorSettingRow,
  MAX_SPORTS_CREATION_AMOUNT,
} from 'common/bdl/major-leagues'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { api, APIError } from 'web/lib/api/api'

const sharedScopes = ['global', 'wave:1', 'wave:2', 'wave:3'] as const
export type BudgetScope = BdlLeagueKey | (typeof sharedScopes)[number]
export const scopes: BudgetScope[] = [...BDL_LEAGUE_KEYS, ...sharedScopes]
export function budgetLabel(scope: BudgetScope) {
  if (isBdlLeagueKey(scope)) return BDL_LEAGUES[scope].label + ' daily ante'
  return scope === 'global'
    ? 'Global open ante'
    : 'Wave ' + scope.slice(5) + ' monthly ante'
}
type Props = {
  scope: BudgetScope
  row?: StoredMajorSettingRow
  dirty: boolean
  saving: boolean
  onEdit: () => void
  onSaving: (v: boolean) => void
  onMessage: (v: string) => void
  onReload: () => void
}
export function BudgetForm(props: Props) {
  const { scope, row, dirty, saving, onEdit, onSaving, onMessage, onReload } =
    props
  const pending = useRef(false)
  const league = isBdlLeagueKey(scope)
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending.current || !dirty) return
    const form = new FormData(e.currentTarget)
    const amount = (key: string) =>
      (e.currentTarget.elements.namedItem(key) as HTMLInputElement)
        .valueAsNumber
    const expected = row ?? null,
      cap = amount('cap')
    const request = league
      ? {
          league: scope,
          cap,
          expected,
          baseAnte: amount('baseAnte'),
          startsOn: String(form.get('startsOn')),
          groupSlugs: String(form.get('groups'))
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }
      : { scope, cap, expected }
    const checked =
      API['admin-sports-set-creation-budget'].props.safeParse(request)
    if (!checked.success) {
      onMessage('Check the whole-mana amounts, start date and topic slugs.')
      return
    }
    pending.current = true
    onSaving(true)
    try {
      await api('admin-sports-set-creation-budget', checked.data)
      onMessage(budgetLabel(scope) + ' saved.')
      onReload()
    } catch (err) {
      if (err instanceof APIError && err.code === 400) {
        onMessage(err.message)
        return
      }
      onMessage(
        err instanceof APIError && err.code === 409
          ? 'Budget changed. Review the refreshed values.'
          : 'Save outcome unconfirmed. Check the refreshed budget.'
      )
      onReload()
    } finally {
      pending.current = false
      onSaving(false)
    }
  }
  function input(
    label: string,
    name: string,
    value: string | number | null | undefined,
    options?: ComponentProps<typeof Input>
  ) {
    const attrs = {
      name,
      defaultValue: value ?? '',
      required: true,
      disabled: saving,
      ...options,
    }
    return (
      <label>
        {label}
        <Input className="w-full" {...attrs} />
      </label>
    )
  }
  const whole = { type: 'number', max: MAX_SPORTS_CREATION_AMOUNT, step: 1 }
  const saved = !row
    ? 'No saved budget.'
    : row.cap == null
    ? 'Saved cap is unset.'
    : 'Saved cap · Ṁ' + row.cap.toLocaleString()
  const period = league
    ? 'Starting antes per UTC day.'
    : scope === 'global'
    ? 'Outstanding antes on unresolved markets.'
    : 'Starting antes across this wave per UTC month.'
  return (
    <form
      onSubmit={save}
      onChange={onEdit}
      className="grid min-w-0 gap-3 sm:grid-cols-2"
    >
      <p className="text-ink-600 sm:col-span-2">
        {saved} {period}
      </p>
      {input('Cap (Ṁ)', 'cap', row?.cap, { ...whole, min: 0 })}
      {league && (
        <>
          {input('Starting ante (Ṁ)', 'baseAnte', row?.baseAnte, {
            ...whole,
            min: 1,
          })}
          {input('Starts on (Eastern time)', 'startsOn', row?.startsOn, {
            type: 'date',
          })}
          {input(
            'Topic slugs, comma-separated',
            'groups',
            row?.groupSlugs?.join(', ')
          )}
        </>
      )}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={!dirty || saving}>
          Save budget
        </Button>
        {dirty && (
          <Button size="sm" disabled={saving} onClick={onReload}>
            Discard edits
          </Button>
        )}
      </div>
    </form>
  )
}
