import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { Button } from '../buttons/button'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { UserLink } from '../widgets/user-link'
import { UserHovercard } from '../user/user-hovercard'
import { RelativeTimestamp } from '../relative-timestamp'
import toast from 'react-hot-toast'
import { useAdmin } from 'web/hooks/use-admin'
import { isAdminId, isModId } from 'common/envs/constants'

type PendingAnswer = {
  id: string
  contractId: string
  userId: string
  text: string
  createdTime: number
  status: string
}

export function PendingAnswersPanel(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { contract, user } = props
  const [pendingAnswers, setPendingAnswers] = useState<PendingAnswer[]>([])
  const [loading, setLoading] = useState(true)

  const isCreator = user?.id === contract.creatorId
  const isAdmin = user && isAdminId(user.id)
  const isMod = user && isModId(user.id)
  const canReview = isCreator || isAdmin || isMod

  useEffect(() => {
    if (!canReview) return
    loadPendingAnswers()
  }, [contract.id, canReview])

  const loadPendingAnswers = async () => {
    try {
      setLoading(true)
      const answers = await api('market/:contractId/pending-answers', {
        contractId: contract.id,
      })
      setPendingAnswers(answers)
    } catch (error) {
      console.error('Error loading pending answers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id: string) => {
    try {
      await api('pending-answer/:id/approve', { id })
      toast.success('Answer approved and added to market')
      setPendingAnswers((prev) => prev.filter((a) => a.id !== id))
      // Refresh the page to show the new answer
      window.location.reload()
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve answer')
    }
  }

  const handleDeny = async (id: string) => {
    try {
      await api('pending-answer/:id/deny', { id })
      toast.success('Answer denied')
      setPendingAnswers((prev) => prev.filter((a) => a.id !== id))
    } catch (error: any) {
      toast.error(error.message || 'Failed to deny answer')
    }
  }

  if (!canReview) {
    return null
  }

  if (loading) {
    return (
      <div className="bg-canvas-50 rounded-lg p-4">
        <div className="text-ink-600">Loading pending answers...</div>
      </div>
    )
  }

  if (pendingAnswers.length === 0) {
    return null
  }

  return (
    <div className="bg-canvas-50 rounded-lg p-4">
      <h3 className="text-ink-900 mb-3 text-lg font-semibold">
        Pending Answers ({pendingAnswers.length})
      </h3>
      <Col className="gap-3">
        {pendingAnswers.map((answer) => (
          <div
            key={answer.id}
            className="bg-canvas-0 border-ink-200 rounded-lg border p-3"
          >
            <Row className="items-start justify-between gap-4">
              <Col className="flex-1 gap-1">
                <div className="text-ink-900 font-medium">{answer.text}</div>
                <div className="text-ink-500 text-sm">
                  Submitted by{' '}
                  <UserHovercard userId={answer.userId}>
                    <UserLink
                      user={{
                        id: answer.userId,
                        name: '',
                        username: '',
                      }}
                    />
                  </UserHovercard>{' '}
                  • <RelativeTimestamp time={answer.createdTime} />
                </div>
              </Col>
              <Row className="gap-2">
                <Button
                  size="xs"
                  color="green"
                  onClick={() => handleApprove(answer.id)}
                >
                  Approve
                </Button>
                <Button
                  size="xs"
                  color="red"
                  onClick={() => handleDeny(answer.id)}
                >
                  Deny
                </Button>
              </Row>
            </Row>
          </div>
        ))}
      </Col>
    </div>
  )
}
