import React from 'react'
import { Contract, getContractFromSlug } from 'web/lib/firebase/contracts'
import { ContractsGrid } from 'web/components/contract/contracts-grid'

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const contracts = (await Promise.all(
    slugs.map((slug) =>
      getContractFromSlug(slug) != null ? getContractFromSlug(slug) : []
    )
  )) as Contract[]

  return {
    props: {
      contracts,
    },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractGridPage(props: { contracts: Contract[] }) {
  const { contracts } = props

  return (
    <>
      <ContractsGrid
        contracts={contracts}
        breakpointColumns={{ default: 2, 650: 1 }}
      />
    </>
  )
}
