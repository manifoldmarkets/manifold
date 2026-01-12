import { useState } from 'react'
import { superBanUser } from 'web/lib/supabase/super-ban-user'
import { Button } from './buttons/button'
import { Col } from './layout/col'
import { Modal } from './layout/modal'

const SuperBanControl = (props: {
  userId: string
  onBan?: () => void
  disabled?: boolean
  onModalOpenChange?: (open: boolean) => void
}) => {
  const { userId, onBan, disabled, onModalOpenChange } = props
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [summaryMessage, setSummaryMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const setConfirmModal = (open: boolean) => {
    setShowConfirmModal(open)
    // Keep hovercard open if any modal is open OR if we're loading
    onModalOpenChange?.(open || showSummaryModal || loading)
  }

  const setSummaryModal = (open: boolean) => {
    setShowSummaryModal(open)
    onModalOpenChange?.(open || showConfirmModal || loading)
  }

  async function handleSuperBan() {
    setLoading(true)
    // Notify parent we're busy (loading) before closing modal
    onModalOpenChange?.(true)
    setShowConfirmModal(false)
    try {
      const message = await superBanUser(userId)
      setSummaryMessage(message)
      setShowSummaryModal(true)
      onBan?.()
    } catch (error) {
      console.error('Superban failed:', error)
      // On error, close everything
      onModalOpenChange?.(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        color="red"
        size="xs"
        onClick={() => setConfirmModal(true)}
        disabled={loading || disabled}
        loading={loading}
      >
        Superban
      </Button>

      <Modal open={showConfirmModal} setOpen={setConfirmModal} size="md">
        <Col className={'bg-canvas-0 text-ink-1000 rounded-md p-4 '}>
          <div className="text-left">
            <p>
              Are you sure you want to superban this user? This will ban them,
              unlist and N/A all their markets, and hide all their comments.
            </p>
            <div className="mt-4 flex justify-around">
              <Button color="red" onClick={() => handleSuperBan()}>
                Yes, superban
              </Button>
              <Button color="gray" onClick={() => setConfirmModal(false)}>
                No, cancel
              </Button>
            </div>
          </div>
        </Col>
      </Modal>

      <Modal open={showSummaryModal} setOpen={setSummaryModal} size="md">
        <Col className={'bg-canvas-0 text-ink-1000 rounded-md p-4 '}>
          <div className="text-center">{summaryMessage}</div>
        </Col>
      </Modal>
    </>
  )
}

export default SuperBanControl
