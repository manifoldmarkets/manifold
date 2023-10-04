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
import { Row } from '../layout/row'
import { UserFromId } from 'web/components/user-from-id'

type ContractEdit = Contract & {
  updatedKeys?: string[]
  editCreated: number
  idempotencyKey: string
  editorId: string
}
export const ContractEditHistoryButton = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [contractHasEdits, setContractHasEdits] = useState(false)
  const [edits, setEdits] = useState<ContractEdit[] | undefined>(undefined)
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
          editCreated: new Date(edit.created_time).valueOf(),
          idempotencyKey: edit.idempotency_key
            ? edit.idempotency_key
            : Math.random().toString(),
          updatedKeys: edit.updated_keys,
          editorId: edit.editor_id,
        } as ContractEdit
      }),
      'idempotencyKey'
    )

    setEditTimes([
      ...contracts.map((c) => c.editCreated).slice(1),
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
        <div className={'bg-canvas-50 rounded p-4'}>
          <Title>Edit history</Title>
          <Col className="gap-4">
            {edits?.map((edit, i) => (
              <div key={edit.id}>
                <div className="text-ink-500 mb-1 px-2 text-sm">
                  {i === edits.length - 1 ? 'Created' : 'Saved'}{' '}
                  {formatTimeShort(editTimes[i])}
                </div>
                <div className="text-ink-500 mb-1 px-2 text-sm">
                  <span> Updated: </span>
                  {edit.updatedKeys?.join(', ')}
                </div>

                <Col className="bg-canvas-0 gap-2 rounded-lg p-2">
                  <div className={'text-ink-1000 text-xl font-medium'}>
                    {edit.question}
                  </div>
                  <ContractDescription contract={edit} defaultCollapse={true} />
                  <Row className={'gap-2'}>
                    <CloseOrResolveTime
                      className="text-ink-700 text-sm"
                      contract={edit}
                    />
                    {edit.resolution && edit.resolution}
                  </Row>
                  <Row className={'items-center gap-2'}>
                    Editor:
                    <UserFromId userId={edit.editorId} />
                  </Row>
                </Col>
              </div>
            ))}
          </Col>
        </div>
      </Modal>
    </>
  )
}
