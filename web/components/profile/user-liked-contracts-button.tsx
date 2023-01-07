import { User } from 'common/user'
import { memo, useEffect, useState } from 'react'
import { TextButton } from 'web/components/buttons/text-button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { SiteLink } from 'web/components/widgets/site-link'
import { Row } from 'web/components/layout/row'
import { XIcon } from '@heroicons/react/outline'
import { unReact } from 'web/lib/firebase/reactions'
import {
  getLikedContracts,
  getLikedContractsCount,
  SearchContractLike,
} from 'web/lib/supabase/reactions'

// Note: this button does NOT live update
export const UserLikedContractsButton = memo(
  function UserLikedContractsButton(props: { user: User; className?: string }) {
    const { user, className } = props
    const [isOpen, setIsOpen] = useState(false)

    const [contractLikes, setContractLikes] = useState<
      SearchContractLike[] | undefined
    >(undefined)
    const [likedContractsCount, setLikedContractsCount] = useState(0)

    useEffect(() => {
      getLikedContractsCount(user.id).then(setLikedContractsCount)
    }, [user.id])

    useEffect(() => {
      if (!isOpen || contractLikes !== undefined) return
      getLikedContracts(user.id).then(setContractLikes)
    }, [contractLikes, isOpen, user.id])

    return (
      <>
        <TextButton onClick={() => setIsOpen(true)} className={className}>
          <span className="font-semibold">{likedContractsCount}</span> Likes
        </TextButton>
        <Modal open={isOpen} setOpen={setIsOpen}>
          <Col className="rounded bg-white p-6">
            <span className={'mb-4 text-xl'}>Liked Markets</span>
            <Col className={'gap-4'}>
              {contractLikes?.map((likedContract) => (
                <Row key={likedContract.id} className={'justify-between gap-2'}>
                  <SiteLink
                    href={likedContract.slug}
                    className={'truncate text-indigo-700'}
                  >
                    {likedContract.title}
                  </SiteLink>
                  <XIcon
                    className="ml-2 h-5 w-5 shrink-0 cursor-pointer"
                    onClick={() => {
                      unReact(
                        user.id,
                        likedContract.contentId,
                        'contract',
                        'like'
                      )
                      setContractLikes(
                        contractLikes.filter(
                          (contract) =>
                            contract.contentId !== likedContract.contentId
                        )
                      )
                      setLikedContractsCount(likedContractsCount - 1)
                    }}
                  />
                </Row>
              ))}
            </Col>
          </Col>
        </Modal>
      </>
    )
  }
)
