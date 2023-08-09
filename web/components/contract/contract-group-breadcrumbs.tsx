import { Contract } from 'common/contract'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { useGroupsWithContract } from 'web/hooks/use-group-supabase'

export const ContractGroupBreadcrumbs = (props: { contract: Contract }) => {
  const { contract } = props
  const { groupLinks } = contract
  const groups = useGroupsWithContract(contract) ?? []
  return (
    <Row className={clsx((groupLinks?.length ?? 0) > 0 ? 'h-5' : 'h-0')}></Row>
  )
}
