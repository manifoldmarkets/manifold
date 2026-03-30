import {
  BOOST_PAYMENT_TYPE,
  BOOST_PURCHASE_EVENT_NAMES,
  type BoostPaymentType,
} from 'common/boost'

import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

type BoostHistoryRow = {
  id: number
  contract_id: string | null
  post_id: string | null
  user_id: string
  start_time: Date | string
  end_time: Date | string
  created_time: Date | string
  funded: boolean
  user_name: string
  user_username: string
  contract_slug: string | null
  contract_question: string | null
  post_slug: string | null
  post_title: string | null
  mana_txn_id: string | null
  cash_audit_time: Date | string | null
}

const getBoostPaymentType = (boost: BoostHistoryRow): BoostPaymentType => {
  if (boost.mana_txn_id) return BOOST_PAYMENT_TYPE.MANA
  if (boost.cash_audit_time || !boost.funded) return BOOST_PAYMENT_TYPE.CASH
  return BOOST_PAYMENT_TYPE.FREE
}

export const getBoostHistory: APIHandler<'get-boost-history'> = async (props) => {
  const { contractId, postId, userId, includePending, limit, offset } = props
  const pg = createSupabaseDirectClient()

  const boosts = await pg.manyOrNone<BoostHistoryRow>(
    `with boosts as (
       select
         cb.id,
         cb.contract_id,
         cb.post_id,
         cb.user_id,
         cb.start_time,
         cb.end_time,
         cb.created_time,
         cb.funded
       from contract_boosts cb
       where ($1::text is null or cb.contract_id = $1)
         and ($2::text is null or cb.post_id = $2)
         and ($3::text is null or cb.user_id = $3)
         and ($4::boolean or cb.funded)
       order by cb.created_time desc, cb.id desc
       limit $5
       offset $6
     ),
     mana_txns as (
       select distinct on (t.data->'data'->>'boostId')
         t.data->'data'->>'boostId' as boost_id,
         t.id
       from txns t
       join boosts b on t.data->'data'->>'boostId' = b.id::text
       where t.category = 'CONTRACT_BOOST_PURCHASE'
       order by t.data->'data'->>'boostId', t.created_time desc
     ),
     cash_audits as (
       select distinct on (ae.user_id, ae.data->>'boostId')
         ae.user_id,
         ae.data->>'boostId' as boost_id,
         ae.created_time
       from audit_events ae
       join boosts b
         on ae.user_id = b.user_id
         and ae.data->>'boostId' = b.id::text
       where ae.name in ($7, $8)
         and ae.data->>'paymentMethod' = $9
       order by ae.user_id, ae.data->>'boostId', ae.created_time desc
     )
     select
       b.id,
       b.contract_id,
       b.post_id,
       b.user_id,
       b.start_time,
       b.end_time,
       b.created_time,
       b.funded,
       u.name as user_name,
       u.username as user_username,
       c.slug as contract_slug,
       c.question as contract_question,
       p.data->>'slug' as post_slug,
       p.data->>'title' as post_title,
       mana_txns.id as mana_txn_id,
       cash_audits.created_time as cash_audit_time
     from boosts b
     join users u on u.id = b.user_id
     left join contracts c on c.id = b.contract_id
     left join old_posts p on p.id = b.post_id
     left join mana_txns on mana_txns.boost_id = b.id::text
     left join cash_audits
       on cash_audits.user_id = b.user_id
       and cash_audits.boost_id = b.id::text
     order by b.created_time desc, b.id desc`,
    [
      contractId ?? null,
      postId ?? null,
      userId ?? null,
      includePending,
      limit,
      offset,
      BOOST_PURCHASE_EVENT_NAMES.contract,
      BOOST_PURCHASE_EVENT_NAMES.post,
      BOOST_PAYMENT_TYPE.CASH,
    ]
  )

  return {
    boosts: boosts.map((boost) => {
      const contentType = boost.contract_id ? 'contract' : 'post'
      const paymentType = getBoostPaymentType(boost)
      const slug = boost.contract_slug ?? boost.post_slug

      return {
        id: boost.id,
        contentType,
        contentId: boost.contract_id ?? boost.post_id ?? '',
        contractId: boost.contract_id,
        postId: boost.post_id,
        title: boost.contract_question ?? boost.post_title ?? '',
        slug,
        url: slug
          ? contentType === 'contract'
            ? `/${slug}`
            : `/post/${slug}`
          : null,
        userId: boost.user_id,
        userName: boost.user_name,
        userUsername: boost.user_username,
        createdTime: new Date(boost.created_time).getTime(),
        startTime: new Date(boost.start_time).getTime(),
        endTime: new Date(boost.end_time).getTime(),
        funded: boost.funded,
        paymentType,
        isFree: paymentType === BOOST_PAYMENT_TYPE.FREE,
        manaPurchaseTxnId: boost.mana_txn_id,
      }
    }),
  }
}
