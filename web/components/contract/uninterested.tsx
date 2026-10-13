import { Contract } from 'common/contract'
import { MouseEvent } from 'react'
import toast from 'react-hot-toast'
import { TiVolumeMute } from 'react-icons/ti'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Tooltip } from '../widgets/tooltip'

// The behaviour this copy promises is defined in common/disinterests.ts.
export const UNINTERESTED_EXPLAINER =
  'Hides this question from your home feed, along with near-identical questions (the same question for another date, say), and shows you less from its topics for the next 6 months. Search still finds it. Click again to undo.'

export const uninterestedLabel = (uninterested: boolean) =>
  uninterested ? 'Undo uninterested' : 'Uninterested'

type UninterestedSource = 'market page' | 'feed card' | 'browse for-you'

export const setUninterested = async (
  contract: Contract,
  uninterested: boolean,
  source: UninterestedSource
) => {
  const result = await api('market/:contractId/uninterested', {
    contractId: contract.id,
    uninterested,
  })
  track(uninterested ? 'mark uninterested' : 'undo uninterested', {
    contractId: contract.id,
    source,
    hiddenSimilarCount: result.hiddenSimilarCount,
  })
  return result
}

/** Marks the market uninterested and says what that did, with an undo. */
export const markUninterestedWithToast = async (
  contract: Contract,
  source: UninterestedSource,
  onUndo?: () => void
) => {
  const result = await setUninterested(contract, true, source)
  const n = result.hiddenSimilarCount
  const similar =
    n === 0
      ? ''
      : n === 1
      ? ' and 1 near-identical question'
      : ` and ${n} near-identical questions`
  toast(
    (t) => (
      <Row className="items-center gap-3">
        <span>Hidden from your feed{similar}.</span>
        <button
          type="button"
          className="text-primary-600 hover:text-primary-700 shrink-0 font-semibold"
          onClick={async () => {
            toast.dismiss(t.id)
            await setUninterested(contract, false, source)
            onUndo?.()
            toast('Restored to your feed')
          }}
        >
          Undo
        </button>
      </Row>
    ),
    {
      icon: <TiVolumeMute className="h-5 w-5 text-teal-500" />,
      duration: 7000,
    }
  )
  return result
}

/** Menu label with the (i) explainer. */
export function UninterestedMenuLabel(props: { uninterested: boolean }) {
  return (
    <Row className="grow items-center justify-between gap-2">
      <span>{uninterestedLabel(props.uninterested)}</span>
      {/* The (i) sits inside the menu button: a tap on it should open the
          explainer, not fire the action. Keyboard users act on the menu
          button itself, so this wrapper needs no key handling of its own. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- scopes a tap on the (i) inside an already-interactive menu button */}
      <span className="flex" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <InfoTooltip
          text={UNINTERESTED_EXPLAINER}
          size="sm"
          className="!mb-0"
          tooltipParams={{ placement: 'left' }}
        />
      </span>
    </Row>
  )
}

/**
 * Hover affordance for For You rows on the home page. The dropdown on the
 * market page is where this used to live, and nobody found it there.
 */
export function UninterestedRowButton(props: {
  contract: Contract
  onHidden: () => void
}) {
  const { contract, onHidden } = props
  const user = useUser()
  // Keep the column's width so rows stay aligned.
  if (!user || user.id === contract.creatorId)
    return <div className="h-5 w-5" />
  return (
    <Tooltip text="Uninterested" placement="left" noTap>
      <button
        type="button"
        aria-label={`Uninterested in ${contract.question}`}
        className="text-ink-400 hover:text-ink-900 flex items-center rounded opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-70"
        onClick={(e: MouseEvent) => {
          // The row is a link; hide, don't navigate.
          e.preventDefault()
          e.stopPropagation()
          onHidden()
          markUninterestedWithToast(contract, 'browse for-you').catch((err) =>
            toast.error(err instanceof Error ? err.message : String(err))
          )
        }}
      >
        <TiVolumeMute className="h-5 w-5" />
      </button>
    </Tooltip>
  )
}
