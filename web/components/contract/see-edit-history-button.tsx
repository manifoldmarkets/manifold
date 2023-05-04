import { Contract } from 'common/contract'
import { Button } from 'web/components/buttons/button'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useEffect, useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { ContractDescription } from 'web/components/contract/contract-description'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Row } from 'web/components/layout/row'
import { CloseOrResolveTime } from 'web/components/contract/contract-details'
import { uniqBy } from 'lodash'

type EditHistory = Contract & {
  editCreatedTime: number
}
export const SeeEditHistoryButton = (props: { contract: Contract }) => {
  const { contract } = props
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [contractHasEdits, setContractHasEdits] = useState(false)
  const [edits, setEdits] = useState<EditHistory[] | undefined>(undefined)
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

    const contracts = uniqBy(
      data.map((edit) => {
        const contract = edit.data as Contract
        return {
          ...contract,
          editCreatedTime: new Date(edit.created_time).valueOf(),
          idempotencyKey: edit.idempotency_key
            ? edit.idempotency_key
            : Math.random(),
        }
      }),
      'idempotencyKey'
    )
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
      >
        History
      </Button>
      <Modal size={'lg'} open={showEditHistory} setOpen={setShowEditHistory}>
        <Col className={'bg-canvas-100 p-4'}>
          <Title children={'Edit history'} />
          {edits?.map((edit, index) => (
            <Col
              className={'text-ink-500 bg-canvas-50 my-2 gap-2 rounded-md p-2'}
            >
              <Row>
                Edit {'#' + (edits?.length - index)} (
                <RelativeTimestamp
                  className={'-ml-1'}
                  time={edit.editCreatedTime}
                />
                )
              </Row>
              <Row className={'gap-1'}>
                <span className={'text-ink-1000 font-bold'}>
                  {edit.question}
                </span>
              </Row>
              <Col className={'gap-1'}>
                <ContractDescription contract={edit} />
              </Col>
              <Row>
                <CloseOrResolveTime contract={edit} editable={false} />
              </Row>
            </Col>
          ))}
        </Col>
      </Modal>
    </>
  )
}
