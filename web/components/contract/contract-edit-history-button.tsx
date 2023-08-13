import { Contract } from 'common/contract'
import { Button } from 'web/components/buttons/button'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useEffect, useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { ContractDescription } from 'web/components/contract/contract-description'
import { CloseOrResolveTime } from 'web/components/contract/contract-details'
import { uniqBy } from 'lodash'
import { formatTimeShort } from 'web/lib/util/time'

export const ContractEditHistoryButton = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [contractHasEdits, setContractHasEdits] = useState(false)
  const [edits, setEdits] = useState<Contract[] | undefined>(undefined)
  const [editTimes, setEditTimes] = useState<number[]>([])

  const getCount = async () => {
    const { count } = await db
      .from('contract_edits')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contract.id)
    setContractHasEdits(count ? count > 0 : false)
  }
  useEffect(() => {
    getCount()
  }, [contract.id])

  const loadEdits = async () => {
    const { data } = await run(
      db
        .from('contract_edits')
        .select('*')
        .eq('contract_id', contract.id)
        .order('created_time', { ascending: false })
    )

    // created_time is the time the row is created, but the row's content is the content before the edit, aka created_time is when the content is deleted and replaced
    const contracts = uniqBy(
      data.map((edit) => {
        const contract = edit.data as Contract
        return {
          ...contract,
          versionDeletedTime: new Date(edit.created_time).valueOf(),
          idempotencyKey: edit.idempotency_key
            ? edit.idempotency_key
            : Math.random(),
        }
      }),
      'idempotencyKey'
    )

    setEditTimes([
      ...contracts.map((c) => c.versionDeletedTime).slice(1),
      contract.createdTime,
    ])

    setEdits(contracts)
  }
  useEffect(() => {
    if (showEditHistory && edits === undefined) {
      loadEdits()
    }
  }, [showEditHistory])
  if (!contractHasEdits) return null
  return (
    <>
      <Button
        color="gray"
        size={'2xs'}
        onClick={() => setShowEditHistory(true)}
        className={className}
      >
        See history
      </Button>
      <Modal size={'lg'} open={showEditHistory} setOpen={setShowEditHistory}>
        <div className={'bg-canvas-100 border-canvas-50 rounded border p-4'}>
          <Title>Edit history</Title>
          <Col className="gap-4">
            {edits?.map((edit, i) => (
              <Col key={edit.id} className="bg-canvas-0 gap-2 p-2">
                <div className="text-ink-500 text-sm">
                  {i === edits.length - 1 ? 'Created' : 'Saved'}{' '}
                  {formatTimeShort(editTimes[i])}
                </div>

                <div className={'text-ink-1000 text-xl font-medium'}>
                  {edit.question}
                </div>
                <ContractDescription contract={edit} defaultCollapse={true} />
                <CloseOrResolveTime
                  className="text-ink-700 text-sm"
                  contract={edit}
                />
              </Col>
            ))}
          </Col>
        </div>
      </Modal>
    </>
  )
}
