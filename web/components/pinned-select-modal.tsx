import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { Post } from 'common/post'
import { useState } from 'react'
import { Button } from './buttons/button'
import { PillButton } from './buttons/pill-button'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Row } from './layout/row'
import { LoadingIndicator } from './widgets/loading-indicator'
import { PostCardList } from './posts/post-card'
import { GroupCard } from 'web/pages/groups'
import { Input } from './widgets/input'
import { debounce } from 'lodash'
import { searchInAny } from 'common/util/parse'
import { SupabaseContractSearch } from './supabase-search'

export function PinnedSelectModal(props: {
  title: string
  description?: React.ReactNode
  open: boolean
  setOpen: (open: boolean) => void
  onSubmit: (
    selectedItems: { itemId: string; type: string }[]
  ) => void | Promise<void>
  contractSearchOptions?: Partial<Parameters<typeof SupabaseContractSearch>[0]>
  posts: Post[]
  groups?: Group[]
  group?: Group
}) {
  const {
    title,
    description,
    open,
    setOpen,
    onSubmit,
    contractSearchOptions,
    posts,
    groups,
    group,
  } = props

  const [selectedItem, setSelectedItem] = useState<{
    itemId: string
    type: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedTab, setSelectedTab] = useState<
    'contracts' | 'posts' | 'groups'
  >('posts')
  const [groupsQuery, setGroupsQuery] = useState('')

  async function selectContract(contract: Contract) {
    selectItem(contract.id, 'contract')
  }

  async function selectPost(post: Post) {
    selectItem(post.id, 'post')
  }

  async function selectGroup(group: Group) {
    selectItem(group.id, 'group')
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
  const debouncedQuery = debounce(setGroupsQuery, 50)

  return (
    <Modal open={open} setOpen={setOpen} className={' sm:p-0'} size={'lg'}>
      <Col className=" bg-canvas-0 text-ink-1000 h-[85vh] w-full gap-4 overflow-scroll rounded-md">
        <div className=" p-8 pb-0">
          <Row>
            <div className={'text-primary-700 text-xl'}>{title}</div>

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
            <PillButton
              onSelect={() => setSelectedTab('groups')}
              selected={selectedTab === 'groups'}
            >
              Groups
            </PillButton>
          </Row>
        </div>

        {selectedTab === 'contracts' ? (
          <div className="grow overflow-y-auto px-2 sm:px-8">
            <SupabaseContractSearch
              hideOrderSelector
              onContractClick={selectContract}
              cardUIOptions={{
                hideGroupLink: true,
                hideQuickBet: true,
                noLinkAvatar: true,
              }}
              highlightContractIds={[selectedItem?.itemId ?? '']}
              additionalFilter={group ? { groupSlug: group.slug } : undefined}
              persistPrefix={group ? `group-${group.slug}` : undefined}
              headerClassName="bg-ink-1000"
              {...contractSearchOptions}
            />
          </div>
        ) : selectedTab === 'posts' ? (
          <>
            <div className="mt-2 px-2">
              <PostCardList
                posts={posts}
                onPostClick={selectPost}
                highlightCards={[selectedItem?.itemId ?? '']}
              />
              {posts.length == 0 && (
                <div className="text-ink-500 text-center">No posts yet</div>
              )}
            </div>
          </>
        ) : (
          groups && (
            <>
              <div className="mt-2 px-2">
                <Col>
                  <Input
                    type="text"
                    onChange={(e) => debouncedQuery(e.target.value)}
                    placeholder="Search groups"
                    value={groupsQuery}
                    className="mb-4 w-full"
                  />
                  {groups
                    .filter((g) =>
                      searchInAny(groupsQuery, g.name, g.about || '')
                    )
                    .map((group) => (
                      <GroupCard
                        key={group.id}
                        highlightCards={[selectedItem?.itemId ?? '']}
                        group={group}
                        onGroupClick={selectGroup}
                      />
                    ))}
                </Col>
              </div>
            </>
          )
        )}
      </Col>
    </Modal>
  )
}
