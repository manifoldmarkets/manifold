import { useState, useEffect } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { Tooltip } from 'web/components/widgets/tooltip'
import { toast } from 'react-hot-toast'
import { api } from 'web/lib/api/api'
import Link from 'next/link'

export function GiveAwardModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  contractId: string
  commentId: string
  recipientId: string
  inventory: { plus: number; premium: number; crystal: number } | null
  refreshInventory: () => void
}) {
  const { open, setOpen, contractId, commentId, inventory, refreshInventory } =
    props
  const [awardType, setAwardType] = useState<
    'plus' | 'premium' | 'crystal' | null
  >(null)

  // Reset selection when modal opens
  useEffect(() => {
    if (!open) {
      setAwardType(null)
      return
    }
    // Refresh inventory when modal opens to get latest data
    refreshInventory()
  }, [open, refreshInventory])

  // Auto-select first owned award
  useEffect(() => {
    if (!open || !inventory) return
    const current = awardType
    if (!current || inventory[current] <= 0) {
      const first = (['plus', 'premium', 'crystal'] as const).find(
        (t) => inventory[t] > 0
      )
      setAwardType(first ?? null)
    }
  }, [inventory, open])
  const onConfirm = async () => {
    if (!awardType || !inventory || inventory[awardType] <= 0) return
    try {
      await api('give-comment-award', { contractId, commentId, awardType })
      toast.success('Award sent!')
      refreshInventory() // Refresh after giving award
      setOpen(false)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send award')
    }
  }
  const canConfirm = !!inventory && !!awardType && inventory[awardType] > 0
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      size="sm"
      className="bg-canvas-0 rounded-lg p-6"
    >
      <Col className="gap-3 p-3">
        <Row className="items-center justify-between">
          <div className="text-lg font-semibold">Give award</div>
          <Link href="/shop" className="text-primary-600 text-sm underline">
            Purchase awards
          </Link>
        </Row>
        <Row className="gap-3">
          <button
            className={
              'border-ink-300 rounded-md border p-2' +
              (awardType === 'plus' ? ' ring-primary-500 ring-2' : '') +
              (inventory != null && inventory.plus <= 0
                ? ' cursor-not-allowed opacity-50'
                : '')
            }
            onClick={() =>
              inventory && inventory.plus > 0 && setAwardType('plus')
            }
            disabled={inventory != null && inventory.plus <= 0}
          >
            <Tooltip
              text={`Comment award (cost 500; author gets 50)${
                inventory ? ` — You have ${inventory.plus}` : ''
              }`}
            >
              <img
                src="/market-tiers/Plus.svg"
                alt="Plus"
                className="h-12 w-12"
              />
            </Tooltip>
            {inventory != null && (
              <div className="text-ink-600 mt-1 text-center text-xs">
                x{inventory.plus}
              </div>
            )}
          </button>
          <button
            className={
              'border-ink-300 rounded-md border p-2' +
              (awardType === 'premium' ? ' ring-primary-500 ring-2' : '') +
              (inventory != null && inventory.premium <= 0
                ? ' cursor-not-allowed opacity-50'
                : '')
            }
            onClick={() =>
              inventory && inventory.premium > 0 && setAwardType('premium')
            }
            disabled={inventory != null && inventory.premium <= 0}
          >
            <Tooltip
              text={`Premium comment award (cost 2,500; author gets 250)${
                inventory ? ` — You have ${inventory.premium}` : ''
              }`}
            >
              <img
                src="/market-tiers/Premium.svg"
                alt="Premium"
                className="h-12 w-12"
              />
            </Tooltip>
            {inventory != null && (
              <div className="text-ink-600 mt-1 text-center text-xs">
                x{inventory.premium}
              </div>
            )}
          </button>
          <button
            className={
              'border-ink-300 rounded-md border p-2' +
              (awardType === 'crystal' ? ' ring-primary-500 ring-2' : '') +
              (inventory != null && inventory.crystal <= 0
                ? ' cursor-not-allowed opacity-50'
                : '')
            }
            onClick={() =>
              inventory && inventory.crystal > 0 && setAwardType('crystal')
            }
            disabled={inventory != null && inventory.crystal <= 0}
          >
            <Tooltip
              text={`Crystal comment award (cost 10,000; author gets 1,000)${
                inventory ? ` — You have ${inventory.crystal}` : ''
              }`}
            >
              <img
                src="/market-tiers/Crystal.svg"
                alt="Crystal"
                className="h-12 w-12"
              />
            </Tooltip>
            {inventory != null && (
              <div className="text-ink-600 mt-1 text-center text-xs">
                x{inventory.crystal}
              </div>
            )}
          </button>
        </Row>

        <Row className="justify-end gap-2 pt-2">
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
