import _ from 'lodash'
import { Page } from '../../../components/page'

export async function getStaticProps() {
  return {
    props: {},

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function Leaderboards(props: {}) {
  return <Page>Edit fold</Page>
}
