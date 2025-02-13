import { EyeOffIcon } from '@heroicons/react/outline'
import { supabaseConsoleTxnPath } from 'common/envs/constants'
import { type Txn } from 'common/txn'
import { formatMoney } from 'common/util/format'
import { useState } from 'react'
import { Button, IconButton } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { Table } from 'web/components/widgets/table'
import { Title } from 'web/components/widgets/title'
import { UserLink } from 'web/components/widgets/user-link'
import { useAdmin } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { formatTime } from 'client-common/lib/time'
import { uniq } from 'lodash'

export default function CashTxnsPage() {
  const [ignoredCategories, setIgnoredCategories] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const { data } = useAPIGetter('txns', {
    limit: 50,
    offset: page * 50,
    token: 'CASH',
    ignoreCategories: ignoredCategories,
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
            <Button onClick={() => setPage(page - 1)} disabled={page === 0}>
              Previous
            </Button>
            <Button onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </Row>
        <Row className="gap-2">
          <span>Ignored Categories:</span>
          <span>{ignoredCategories.join(', ')}</span>
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
            {data?.map((txn) => (
              <TxnRow
                key={txn.id}
                txn={txn}
                onHideCategory={(category) => {
                  setIgnoredCategories(uniq([...ignoredCategories, category]))
                }}
              />
            ))}
          </tbody>
        </Table>
        <div className="flex items-end gap-1">
          <Button onClick={() => setPage(page - 1)} disabled={page === 0}>
            Previous
          </Button>
          <Button onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </Col>
    </Page>
  )
}

const TxnRow = ({
  txn,
  onHideCategory,
}: {
  txn: Txn
  onHideCategory: (category: string) => void
}) => {
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
      <td>
        <Row className="items-center gap-2">
          {txn.category}
          <IconButton size="xs" onClick={() => onHideCategory(txn.category)}>
            <EyeOffIcon className="h-4 w-4" />
          </IconButton>
        </Row>
      </td>
      <td>{formatTime(txn.createdTime)}</td>
    </tr>
  )
}
