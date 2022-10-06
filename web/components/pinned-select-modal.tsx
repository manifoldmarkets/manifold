import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { Post } from 'common/post'
import { useState } from 'react'
import { Button } from './button'
import { PillButton } from './buttons/pill-button'
import { ContractSearch } from './contract-search'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Row } from './layout/row'
import { LoadingIndicator } from './loading-indicator'
import { PostCardList } from './post-card'

export function PinnedSelectModal(props: {
  title: string
  description?: React.ReactNode
  open: boolean
  setOpen: (open: boolean) => void
  onSubmit: (
    selectedItems: { itemId: string; type: string }[]
  ) => void | Promise<void>
  contractSearchOptions?: Partial<Parameters<typeof ContractSearch>[0]>
  group: Group
  posts: Post[]
}) {
  const {
    title,
    description,
    open,
    setOpen,
    onSubmit,
    contractSearchOptions,
    posts,
    group,
  } = props

  const [selectedItem, setSelectedItem] = useState<{
    itemId: string
    type: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'contracts' | 'posts'>('posts')

  async function selectContract(contract: Contract) {
    selectItem(contract.id, 'contract')
  }

  async function selectPost(post: Post) {
    selectItem(post.id, 'post')
  }

  async function selectItem(itemId: string, type: string) {
    setSelectedItem({ itemId: itemId, type: type })
  }

  async function onFinish() {
    setLoading(true)
    if (selectedItem) {
      await onSubmit([
        {
          itemId: selectedItem.itemId,
          type: selectedItem.type,
        },
      ])
      setLoading(false)
      setOpen(false)
      setSelectedItem(null)
    }
  }

  return (
    <Modal open={open} setOpen={setOpen} className={'sm:p-0'} size={'lg'}>
      <Col className="h-[85vh] w-full gap-4 rounded-md bg-white">
        <div className="p-8 pb-0">
          <Row>
            <div className={'text-xl text-indigo-700'}>{title}</div>

            {!loading && (
              <Row className="grow justify-end gap-4">
                {selectedItem && (
                  <Button onClick={onFinish} color="indigo">
                    Add to Pinned
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setSelectedItem(null)
                    setOpen(false)
                  }}
                  color="gray"
                >
                  Cancel
                </Button>
              </Row>
            )}
          </Row>
          {description}
        </div>

        {loading && (
          <div className="w-full justify-center">
            <LoadingIndicator />
          </div>
        )}
        <div>
          <Row className="justify-center gap-4">
            <PillButton
              onSelect={() => setSelectedTab('contracts')}
              selected={selectedTab === 'contracts'}
            >
              Contracts
            </PillButton>
            <PillButton
              onSelect={() => setSelectedTab('posts')}
              selected={selectedTab === 'posts'}
            >
              Posts
            </PillButton>
          </Row>
        </div>

        {selectedTab === 'contracts' ? (
          <div className="overflow-y-auto px-2 sm:px-8">
            <ContractSearch
              hideOrderSelector
              onContractClick={selectContract}
              cardUIOptions={{
                hideGroupLink: true,
                hideQuickBet: true,
                noLinkAvatar: true,
              }}
              highlightOptions={{
                itemIds: [selectedItem?.itemId ?? ''],
                highlightClassName:
                  '!bg-indigo-100 outline outline-2 outline-indigo-300',
              }}
              additionalFilter={{ groupSlug: group.slug }}
              persistPrefix={`group-${group.slug}`}
              headerClassName="bg-white sticky"
              {...contractSearchOptions}
            />
          </div>
        ) : (
          <>
            <div className="mt-2 px-2">
              <PostCardList
                posts={posts}
                onPostClick={selectPost}
                highlightOptions={{
                  itemIds: [selectedItem?.itemId ?? ''],
                  highlightClassName:
                    '!bg-indigo-100 outline outline-2 outline-indigo-300',
                }}
              />
              {posts.length === 0 && (
                <div className="text-center text-gray-500">No posts yet</div>
              )}
            </div>
          </>
        )}
      </Col>
    </Modal>
  )
}
