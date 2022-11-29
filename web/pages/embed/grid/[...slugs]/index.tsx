import React from 'react'
import {
  Contract,
  getContractFromId,
  getContractFromSlug,
} from 'web/lib/firebase/contracts'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { compact } from 'lodash'

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const contracts = compact(
    await Promise.all([
      ...slugs.map((slug) => getContractFromSlug(slug)),
      ...slugs.map((id) => getContractFromId(id)),
    ])
  )

  return {
    props: {
      contracts,
    },
    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractGridPage(props: { contracts: Contract[] }) {
  const { contracts } = props

  return (
    <ContractsGrid
      contracts={contracts}
      breakpointColumns={{ default: 2, 650: 1 }}
    />
  )
}
