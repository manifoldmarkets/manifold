import { useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { Tooltip } from 'web/components/widgets/tooltip'
import { toast } from 'react-hot-toast'
import { api } from 'web/lib/api/api'
import { useEffect } from 'react'
import Link from 'next/link'

export function GiveAwardModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  contractId: string
  commentId: string
  recipientId: string
}) {
  const { open, setOpen, contractId, commentId } = props
  const [awardType, setAwardType] = useState<
    'plus' | 'premium' | 'crystal' | null
  >(null)
  const [inv, setInv] = useState<{
    plus: number
    premium: number
    crystal: number
  } | null>(null)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    api('get-user-award-inventory', {}).then((res) => {
      if (!cancelled) setInv(res)
    })
    return () => {
      cancelled = true
    }
  }, [open])
  useEffect(() => {
    if (!open || !inv) return
    const current = awardType
    if (!current || inv[current] <= 0) {
      const first = (['plus', 'premium', 'crystal'] as const).find(
        (t) => inv[t] > 0
      )
      setAwardType(first ?? null)
    }
  }, [inv, open])
  const onConfirm = async () => {
    if (!awardType || !inv || inv[awardType] <= 0) return
    try {
      await api('give-comment-award', { contractId, commentId, awardType })
      toast.success('Award sent!')
      setOpen(false)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send award')
    }
  }
  const canConfirm = !!inv && !!awardType && inv[awardType] > 0
  return (
    <Modal open={open} setOpen={setOpen} size="sm" className="bg-canvas-0">
      <Col className="gap-3 p-3">
        <div className="text-lg font-semibold">Give award</div>
        <Row className="gap-3">
          <button
            className={
              'border-ink-300 rounded-md border p-2' +
              (awardType === 'plus' ? ' ring-primary-500 ring-2' : '') +
              (inv != null && inv.plus <= 0
                ? ' cursor-not-allowed opacity-50'
                : '')
            }
            onClick={() => inv && inv.plus > 0 && setAwardType('plus')}
            disabled={inv != null && inv.plus <= 0}
          >
            <Tooltip
              text={`Comment award (cost 500; author gets 50)${
                inv ? ` — You have ${inv.plus}` : ''
              }`}
            >
              <img
                src="/market-tiers/Plus.svg"
                alt="Plus"
                className="h-12 w-12"
              />
            </Tooltip>
            {inv != null && (
              <div className="text-ink-600 mt-1 text-center text-xs">
                x{inv.plus}
              </div>
            )}
          </button>
          <button
            className={
              'border-ink-300 rounded-md border p-2' +
              (awardType === 'premium' ? ' ring-primary-500 ring-2' : '') +
              (inv != null && inv.premium <= 0
                ? ' cursor-not-allowed opacity-50'
                : '')
            }
            onClick={() => inv && inv.premium > 0 && setAwardType('premium')}
            disabled={inv != null && inv.premium <= 0}
          >
            <Tooltip
              text={`Premium comment award (cost 2,500; author gets 250)${
                inv ? ` — You have ${inv.premium}` : ''
              }`}
            >
              <img
                src="/market-tiers/Premium.svg"
                alt="Premium"
                className="h-12 w-12"
              />
            </Tooltip>
            {inv != null && (
              <div className="text-ink-600 mt-1 text-center text-xs">
                x{inv.premium}
              </div>
            )}
          </button>
          <button
            className={
              'border-ink-300 rounded-md border p-2' +
              (awardType === 'crystal' ? ' ring-primary-500 ring-2' : '') +
              (inv != null && inv.crystal <= 0
                ? ' cursor-not-allowed opacity-50'
                : '')
            }
            onClick={() => inv && inv.crystal > 0 && setAwardType('crystal')}
            disabled={inv != null && inv.crystal <= 0}
          >
            <Tooltip
              text={`Crystal comment award (cost 10,000; author gets 1,000)${
                inv ? ` — You have ${inv.crystal}` : ''
              }`}
            >
              <img
                src="/market-tiers/Crystal.svg"
                alt="Crystal"
                className="h-12 w-12"
              />
            </Tooltip>
            {inv != null && (
              <div className="text-ink-600 mt-1 text-center text-xs">
                x{inv.crystal}
              </div>
            )}
          </button>
        </Row>
        <Row className="items-center justify-between">
          {inv && inv.plus + inv.premium + inv.crystal === 0 && (
            <div className="text-ink-600 text-sm">
              You don’t own any awards yet.
            </div>
          )}
          <Link href="/shop" className="text-primary-600 text-sm underline">
            Buy more in shop
          </Link>
        </Row>
        <Row className="justify-end gap-2">
          <Button color="gray-white" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm}>
            Give award
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}
