import { Button } from '../buttons/button'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import clsx from 'clsx'
import { useState, useEffect } from 'react'

export interface ActionBarProps {
  // Primary actions
  onSubmit: () => void
  onReset: () => void
  onSaveDraft: () => void
  onViewDrafts: () => void

  // Submit button state
  isSubmitting: boolean
  submitButtonText: string

  // Draft state
  isSavingDraft: boolean
  draftsCount: number

  // Reset confirmation
  showResetConfirmation: boolean
  setShowResetConfirmation: (show: boolean) => void

  // Shake animation trigger
  submitAttemptCount: number

  // Responsive variant
  variant?: 'mobile' | 'desktop'
}

export function ActionBar(props: ActionBarProps) {
  const {
    onSubmit,
    onReset,
    onSaveDraft,
    onViewDrafts,
    isSubmitting,
    submitButtonText,
    isSavingDraft,
    draftsCount,
    showResetConfirmation,
    setShowResetConfirmation,
    submitAttemptCount,
    variant = 'mobile',
  } = props

  const [shouldShake, setShouldShake] = useState(false)

  // Trigger shake animation when submit is clicked (submitAttemptCount increments)
  useEffect(() => {
    if (submitAttemptCount > 0) {
      setShouldShake(true)
      // Reset shake after animation completes
      const timer = setTimeout(() => setShouldShake(false), 500)
      return () => clearTimeout(timer)
    }
  }, [submitAttemptCount])

  const buttonSize = variant === 'mobile' ? 'md' : 'lg'

  return (
    <Col className="gap-2">
      {/* Create Button - Full Width */}
      <Button
        color="green"
        size={buttonSize}
        className={clsx(
          'w-full',
          shouldShake && 'animate-shake'
        )}
        onClick={onSubmit}
        loading={isSubmitting}
      >
        {submitButtonText}
      </Button>

      {/* Reset, View Drafts, and Save Draft Buttons - Split 1:1:1 */}
      <Row className={clsx(variant === 'mobile' ? 'gap-2' : 'gap-3')}>
        {!showResetConfirmation ? (
          <Button
            color="gray-outline"
            size={buttonSize}
            className="flex-1"
            onClick={() => setShowResetConfirmation(true)}
          >
            Reset
          </Button>
        ) : (
          <Button
            color="red"
            size={buttonSize}
            className="flex-1"
            onClick={onReset}
          >
            Confirm Reset
          </Button>
        )}
        <Button
          color="gray-outline"
          size={buttonSize}
          className="flex-1"
          onClick={onViewDrafts}
          disabled={draftsCount === 0}
        >
          View Drafts
        </Button>
        <Button
          color="gray-outline"
          size={buttonSize}
          className="flex-1"
          onClick={onSaveDraft}
          disabled={isSavingDraft}
          loading={isSavingDraft}
        >
          Save Draft
        </Button>
      </Row>
    </Col>
  )
}
