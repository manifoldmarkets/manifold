import { useState } from 'react'
import toast from 'react-hot-toast'

import { DPMContract } from 'common/contract'
import { isAdminId, isModId } from 'common/envs/constants'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Modal } from 'web/components/layout/modal'
import { useUser } from 'web/hooks/use-user'
import { api, APIError } from 'web/lib/api/api'

export function DpmConvertPanel(props: { contract: DPMContract }) {
  const { contract } = props
  const user = useUser()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!user) return null
  const isCreator = user.id === contract.creatorId
  const canConvert = isCreator || isAdminId(user.id) || isModId(user.id)
  if (!canConvert) return null

  const doConvert = async () => {
    setLoading(true)
    try {
      await api('convert-dpm-to-cpmm', { contractId: contract.id })
      toast.success('Market converted to Classic')
      setOpen(false)
      if (typeof window !== 'undefined') window.location.reload()
    } catch (err) {
      const message =
        err instanceof APIError
          ? err.message
          : 'Failed to convert market. Please try again.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Col className="bg-canvas-50 gap-2 rounded-md border p-4">
        <span className="text-ink-800 text-sm font-semibold">
          Dynamic Parimutuel market
        </span>
        <p className="text-ink-600 text-sm">
          This market must be converted to the Classic (CPMM + limit orders)
          mechanism before it can be resolved. Conversion keeps every
          trader&apos;s payout-equivalent position (YES shares still pay $1 on
          YES, NO shares still pay $1 on NO) and cancels any open limit
          orders.
        </p>
        <Row>
          <Button size="sm" color="indigo" onClick={() => setOpen(true)}>
            Convert to Classic
          </Button>
        </Row>
      </Col>

      <Modal open={open} setOpen={setOpen}>
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <span className="text-lg font-semibold">Convert to Classic?</span>
          <p className="text-ink-600 text-sm">
            Converting locks in the current probability and rewrites every
            DPM bet as Classic shares with the same payout value. This action
            cannot be undone. Open limit orders will be cancelled.
          </p>
          <Row className="justify-end gap-2">
            <Button color="gray" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button color="indigo" loading={loading} onClick={doConvert}>
              Convert
            </Button>
          </Row>
        </Col>
      </Modal>
    </>
  )
}
