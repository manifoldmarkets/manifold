import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { Comment } from 'web/lib/firebase/comments'
import { User } from 'common/user'
import { ContractActivity } from '../feed/contract-activity'
import { ContractBetsTable, BetsSummary } from '../bets-list'
import { Spacer } from '../layout/spacer'
import { Tabs } from '../layout/tabs'
import { Col } from '../layout/col'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { LiquidityProvision } from 'common/liquidity-provision'
import { useComments } from 'web/hooks/use-comments'
import { getUser } from 'web/lib/firebase/users'
import dayjs from 'dayjs'
import { Avatar } from 'web/components/avatar'
import { Grid, _ } from 'gridjs-react'
import 'gridjs/dist/theme/mermaid.css'
import { useState, useEffect } from 'react'
import { maxBy, uniq } from 'lodash'

export function ContractTabs(props: {
  contract: Contract
  user: User | null | undefined
  bets: Bet[]
  liquidityProvisions: LiquidityProvision[]
  comments: Comment[]
  tips: CommentTipMap
}) {
  const { contract, user, bets, tips, liquidityProvisions } = props
  const { outcomeType } = contract

  const userBets = user && bets.filter((bet) => bet.userId === user.id)
  const visibleBets = bets.filter(
    (bet) => !bet.isAnte && !bet.isRedemption && bet.amount !== 0
  )

  // Load comments here, so the badge count will be correct
  const updatedComments = useComments(contract.id)
  const comments = updatedComments ?? props.comments

  const betActivity = (
    <ContractActivity
      contract={contract}
      bets={bets}
      liquidityProvisions={liquidityProvisions}
      comments={comments}
      tips={tips}
      user={user}
      mode="bets"
      betRowClassName="!mt-0 xl:hidden"
    />
  )

  const commentActivity = (
    <>
      <ContractActivity
        contract={contract}
        bets={bets}
        liquidityProvisions={liquidityProvisions}
        comments={comments}
        tips={tips}
        user={user}
        mode={
          contract.outcomeType === 'FREE_RESPONSE'
            ? 'free-response-comment-answer-groups'
            : 'comments'
        }
        betRowClassName="!mt-0 xl:hidden"
      />
      {outcomeType === 'FREE_RESPONSE' && (
        <Col className={'mt-8 flex w-full '}>
          <div className={'text-md mt-8 mb-2 text-left'}>General Comments</div>
          <div className={'mb-4 w-full border-b border-gray-200'} />
          <ContractActivity
            contract={contract}
            bets={bets}
            liquidityProvisions={liquidityProvisions}
            comments={comments}
            tips={tips}
            user={user}
            mode={'comments'}
            betRowClassName="!mt-0 xl:hidden"
          />
        </Col>
      )}
    </>
  )

  const yourTrades = (
    <div>
      <BetsSummary
        className="px-2"
        contract={contract}
        bets={userBets ?? []}
        isYourBets
      />
      <Spacer h={6} />
      <ContractBetsTable contract={contract} bets={userBets ?? []} isYourBets />
      <Spacer h={12} />
    </div>
  )

  const [users, setUsers] = useState({} as {[key: string]: User})
  const [asked, _setAsked] = useState(new Set<string>())

  useEffect(() => {
    uniq(bets.map((bet:Bet) => bet.userId)).filter((uid) => !asked.has(uid)).forEach((uid) => {
      console.log("adding",uid)
      asked.add(uid)
      getUser(uid).then((u) => setUsers((users) => ({...users, [uid]: u})))
    })
  }, [bets])

  const formatUser = (bettorId:string) => {
    const bettor = users[bettorId]
    return _(<div className="flex">
      <Avatar username={bettor?.username} avatarUrl={bettor?.avatarUrl} size="sm" />
      {bettor?.username}
    </div>)
  }

  const gridjsbets = bets.map((bet) => ({...bet, ['username']: users[bet.userId]?.username}))
  const gridjsbetcolumns = [
    {name: "User", id: "userId", formatter:formatUser},
    {name: "bought", id: "shares", formatter: (i:number) => i.toFixed(0)},
    {name: "of", id: "outcome"},
    {name: "for", id: "amount", formatter: (i:number) => "M$"+i.toFixed(0)},
    ...(bets[0]?.orderAmount ?
      [{name: "out of", id: "orderAmount", formatter: (i:number) => i ? "M$"+i.toFixed(0) : ""}] : []),
    {name: "from", id: "probBefore", formatter: (p:number) => (100*p).toFixed(0)+"%"},
    {name: "to", id: "probAfter", formatter: (p:number) => (100*p).toFixed(0)+"%"},
    {name: "on", id: "createdTime", formatter: (t:number) => dayjs(t).format('YY/MM/DD,hh:mm:ss')},
  ]

  const gridjsstyle = {
    table: {
      border: '3px solid #ccc',
      'text-align': 'center',
    },
    th: {
      'background-color': 'rgba(0, 0, 0, 0.1)',
      color: '#000',
      'border-bottom': '3px solid #ccc',
      'padding': '0',
    },
    td: {
      'padding': '0',
    }
  }

  const userpositions = {} as {[key: string]: any}
  bets.forEach((bet) => {
    const {id, position, mana} = userpositions[bet.userId] || {id: bet.userId, position: {}, mana: 0}
    position[bet.outcome] = (position[bet.outcome] || 0) + bet.shares
    userpositions[bet.userId] = {id:id, position:position, mana:(mana + bet.amount)}
  })
  const gridjsusers = Object.values(userpositions).map((row:any) => ({...row, ['username']: users[row.userId]?.username}))

  const argmax = (obj:{[key:string]:number}) => maxBy(Object.keys(obj), (k:string) => obj[k])

  const gridjsusercolumns = [
    {name: "User", id: "id", formatter:formatUser},
    {name: "is down", id: "mana", formatter: (i:number) => "M$"+i.toFixed(0)},
    {name: "and holds", id: "position", formatter: (p:{[key: string]: number}) => p[argmax(p) ?? ""].toFixed(0)},
    {name: "of", id: "position", formatter: (p:{[key: string]: number}) => argmax(p)},
  ]

  return (
    <Tabs
      currentPageForAnalytics={'contract'}
      tabs={[
        {
          title: 'Comments',
          content: commentActivity,
          badge: `${comments.length}`,
        },
        { title: 'Bet feed', content: betActivity, badge: `${visibleBets.length}` },
        { title: 'Bet table', content: <Grid data={gridjsbets} search sort columns={gridjsbetcolumns} style={gridjsstyle} resizable/>},
        { title: 'Users', content: <Grid data={Object.values(gridjsusers)} search sort columns={gridjsusercolumns} style={gridjsstyle} resizable/>},

        ...(!user || !userBets?.length
          ? []
          : [{ title: 'Your bets', content: yourTrades }]),
      ]}
    />
  )
}
