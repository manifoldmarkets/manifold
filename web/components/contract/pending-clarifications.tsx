import { CheckIcon, ClockIcon, XIcon } from '@heroicons/react/solid'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { PendingClarification } from 'common/pending-clarification'
import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { api } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { Content } from '../widgets/editor'

export function PendingClarifications(props: {
  contractId: string
  isCreator: boolean
}) {
  const { contractId, isCreator } = props

  const { data, refresh } = useAPIGetter('get-pending-clarifications', {
    contractId,
  })

  // Store new clarifications from websocket
  const [newClarifications, setNewClarifications] = usePersistentInMemoryState<
    PendingClarification[]
  >([], `pending-clarifications-${contractId}`)

  // Subscribe to new pending clarifications
  useApiSubscription({
    topics: [`contract/${contractId}/pending-clarification`],
    onBroadcast: (msg) => {
      const clarification = msg.data.clarification as PendingClarification
      setNewClarifications((prev) => {
        // Don't add duplicates
        if (prev.some((c) => c.id === clarification.id)) return prev
        return [...prev, clarification]
      })
    },
    enabled: isCreator,
  })

  // Combine API data with websocket data, removing duplicates
  const apiClarifications = data ?? []
  const allIds = new Set(apiClarifications.map((c) => c.id))
  const uniqueNewClarifications = newClarifications.filter(
    (c) => !allIds.has(c.id)
  )
  const pendingClarifications = [
    ...apiClarifications,
    ...uniqueNewClarifications,
  ]

  const handleRefresh = () => {
    refresh()
    // Clear new clarifications since we're refreshing from API
    setNewClarifications([])
  }

  if (!isCreator || pendingClarifications.length === 0) {
    return null
  }

  return (
    <Col className="mt-4 gap-3">
      <h3 className="text-ink-600 text-sm font-semibold">
        Pending AI Clarifications
      </h3>
      {pendingClarifications.map((clarification) => (
        <PendingClarificationCard
          key={clarification.id}
          clarification={clarification}
          onAction={handleRefresh}
        />
      ))}
    </Col>
  )
}

function PendingClarificationCard(props: {
  clarification: PendingClarification
  onAction: () => void
}) {
  const { clarification, onAction } = props
  const [isApplying, setIsApplying] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const autoApplyTime = clarification.createdTime + 60 * 60 * 1000 // 1 hour
  const timeUntilAutoApply = autoApplyTime - Date.now()
  const minutesUntilAutoApply = Math.max(
    0,
    Math.ceil(timeUntilAutoApply / (60 * 1000))
  )

  const handleApply = async () => {
    setIsApplying(true)
    try {
      const result = await api('apply-pending-clarification', {
        clarificationId: clarification.id,
      })
      if (result.alreadyApplied) {
        toast.success('Clarification was already applied')
      } else {
        toast.success('Clarification applied to description')
      }
      onAction()
    } catch (e: any) {
      console.error(e)
      const message = e?.message || 'Failed to apply clarification'
      toast.error(message)
    } finally {
      setIsApplying(false)
    }
  }

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      await api('cancel-pending-clarification', {
        clarificationId: clarification.id,
      })
      toast.success('Clarification dismissed')
      onAction()
    } catch (e: any) {
      console.error(e)
      const message = e?.message || 'Failed to dismiss clarification'
      toast.error(message)
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
      <Row className="mb-2 items-center justify-between">
        <Row className="text-ink-500 items-center gap-1 text-xs">
          <ClockIcon className="h-4 w-4" />
          <span>
            Auto-applies in {minutesUntilAutoApply} min
            {minutesUntilAutoApply !== 1 ? 's' : ''}
          </span>
        </Row>
        <span className="text-ink-400 text-xs">
          <RelativeTimestamp time={clarification.createdTime} />
        </span>
      </Row>

      <div className="text-ink-700 mb-3">
        <Content content={clarification.data.richText} size="sm" />
      </div>

      <Row className="justify-end gap-2">
        <Button
          color="gray-outline"
          size="xs"
          onClick={handleCancel}
          loading={isCancelling}
          disabled={isApplying || isCancelling}
        >
          <XIcon className="mr-1 h-4 w-4" />
          Dismiss
        </Button>
        <Button
          color="green"
          size="xs"
          onClick={handleApply}
          loading={isApplying}
          disabled={isApplying || isCancelling}
        >
          <CheckIcon className="mr-1 h-4 w-4" />
          Apply
        </Button>
      </Row>
    </div>
  )
}
