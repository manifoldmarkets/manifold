import _ from 'lodash'
import { ArrowCircleLeftIcon } from '@heroicons/react/solid'

import { Col } from '../../../components/layout/col'
import { Leaderboard } from '../../../components/leaderboard'
import { Page } from '../../../components/page'
import { SiteLink } from '../../../components/site-link'
import { formatMoney } from '../../../lib/util/format'
import { foldPath, getFoldBySlug } from '../../../lib/firebase/folds'
import { Fold } from '../../../../common/fold'
import { Spacer } from '../../../components/layout/spacer'

export async function getStaticProps(props: { params: { foldSlug: string } }) {
  const { foldSlug } = props.params

  const fold = await getFoldBySlug(foldSlug)

  return {
    props: { fold },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function Leaderboards(props: { fold: Fold }) {
  const { fold } = props
  return (
    <Page>
      <SiteLink href={foldPath(fold)}>
        <ArrowCircleLeftIcon className="h-5 w-5 text-gray-500 inline mr-1" />{' '}
        {fold.name}
      </SiteLink>

      <Spacer h={4} />

      <Col className="items-center lg:flex-row gap-10">
        <Leaderboard
          title="🏅 Top traders"
          users={[]}
          columns={[
            {
              header: 'Total profit',
              renderCell: (user) => formatMoney(user.totalPnLCached),
            },
          ]}
        />
        <Leaderboard
          title="🏅 Top creators"
          users={[]}
          columns={[
            {
              header: 'Market volume',
              renderCell: (user) => formatMoney(user.creatorVolumeCached),
            },
          ]}
        />
      </Col>
    </Page>
  )
}
