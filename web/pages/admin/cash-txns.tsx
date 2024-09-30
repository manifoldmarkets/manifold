import { supabaseConsoleTxnPath } from 'common/envs/constants'
import { type Txn } from 'common/txn'
import { formatMoney } from 'common/util/format'
import { useCallback } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { Table } from 'web/components/widgets/table'
import { Title } from 'web/components/widgets/title'
import { UserLink } from 'web/components/widgets/user-link'
import { useAdmin } from 'web/hooks/use-admin'
import { usePagination } from 'web/hooks/use-pagination'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { api } from 'web/lib/api/api'
import { formatTime } from 'web/lib/util/time'

export default function CashTxnsPage() {
  const fetch = useCallback(
    ({ limit, offset }: { limit: number; offset: number }) =>
      api('txns', { limit, offset, token: 'CASH' }),
    []
  )

  const pagination = usePagination({
    pageSize: 50,
    prefix: [] as Txn[],
    q: fetch,
  })

  // TODO: it's actually ok for anyone to see this page
  const isAdmin = useAdmin()
  if (!isAdmin) return <></>

  return (
    <Page trackPageView={false}>
      <Col className="gap-4">
        <Row className="items-start justify-between">
          <Title>Cash Transactions</Title>
          <div className="flex gap-1">
            <Button onClick={pagination.getPrev} disabled={pagination.isStart}>
              Previous
            </Button>
            <Button onClick={pagination.getNext}>Next</Button>
          </div>
        </Row>
        <Table className="w-full">
          <thead>
            <tr>
              <th>ID</th>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((txn) => (
              <TxnRow key={txn.id} txn={txn} />
            ))}
          </tbody>
        </Table>
        <div className="flex items-end gap-1">
          <Button onClick={pagination.getPrev} disabled={pagination.isStart}>
            Previous
          </Button>
          <Button onClick={pagination.getNext}>Next</Button>
        </div>
      </Col>
    </Page>
  )
}

const TxnRow = ({ txn }: { txn: Txn }) => {
  const a = useDisplayUserById(txn.fromId)
  const b = useDisplayUserById(txn.toId)

  return (
    <tr>
      <td>
        <a
          className="text-primary-700 hover-underline cursor-pointer"
          href={supabaseConsoleTxnPath(txn.id)}
        >
          {txn.id}
        </a>
      </td>
      <td>
        {txn.fromType === 'USER' && a ? (
          <Row className="gap-1">
            <Avatar username={a.username} avatarUrl={a.avatarUrl} size="xs" />
            <UserLink user={a} />
          </Row>
        ) : (
          txn.fromId
        )}
      </td>
      <td>
        {txn.toType === 'USER' && b ? (
          <Row className="gap-1">
            <Avatar username={b.username} avatarUrl={b.avatarUrl} size="xs" />
            <UserLink user={b} />
          </Row>
        ) : (
          txn.toId
        )}
      </td>
      <td>{formatMoney(txn.amount, 'CASH')}</td>
      <td>{txn.category}</td>
      <td>{formatTime(txn.createdTime)}</td>
    </tr>
  )
}
