import _ from 'lodash'
import { Contract } from '../../../../common/contract'
import { Fold } from '../../../../common/fold'
import { SearchableGrid } from '../../../components/contracts-list'
import { FoldBack } from '../../../components/fold-back'
import { Spacer } from '../../../components/layout/spacer'
import { Page } from '../../../components/page'
import { SEO } from '../../../components/SEO'
import { useQueryAndSortParams } from '../../../hooks/use-sort-and-query-params'
import { getFoldBySlug, getFoldContracts } from '../../../lib/firebase/folds'

export async function getStaticProps(props: { params: { foldSlug: string } }) {
  const { foldSlug } = props.params

  const fold = await getFoldBySlug(foldSlug)
  const contracts = fold ? await getFoldContracts(fold) : []

  return {
    props: {
      fold,
      contracts,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function Markets(props: { fold: Fold; contracts: Contract[] }) {
  const { fold, contracts } = props
  const { query, setQuery, sort, setSort } = useQueryAndSortParams({
    defaultSort: 'most-traded',
  })

  return (
    <Page>
      <SEO
        title={`${fold.name}'s markets`}
        description={`Explore or search all the markets of ${fold.name}`}
        url="/markets"
      />

      <FoldBack fold={fold} />

      <Spacer h={4} />

      <SearchableGrid
        contracts={contracts}
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
      />
    </Page>
  )
}
