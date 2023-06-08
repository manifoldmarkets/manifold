import { QuestionMarkCircleIcon } from '@heroicons/react/outline'
import { ENV_CONFIG } from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import Router from 'next/router'
import { useState } from 'react'
import { useMutation } from 'react-query'
import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { NoSEO } from 'web/components/NoSEO'
import { AmountInput } from 'web/components/widgets/amount-input'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { Tooltip } from 'web/components/widgets/tooltip'
import { createPost } from 'web/lib/firebase/api'
import { postPath } from 'web/lib/supabase/post'

const PRICE_PER_USER = 5

export default function CreateAdPage() {
  const editor = useTextEditor({ size: 'lg' })
  const [totalFunds, setTotalFunds] = useState<number>()

  const numViews = Math.floor((totalFunds ?? 0) / PRICE_PER_USER)

  const createAdMutation = useMutation(async () => {
    if (!editor || totalFunds == 0) return
    const newPost = removeUndefinedProps({
      type: 'ad',
      totalCost: totalFunds,
      costPerView: PRICE_PER_USER,
      content: editor.getJSON(),
      title: '[AD]',
    })

    const result = await createPost(newPost)
    Router.push(postPath(result.post.slug))
  })

  return (
    <Page>
      <NoSEO />
      <div className="mx-auto w-full max-w-2xl px-6 py-4 lg:py-0">
        <Title>Create Advertisement</Title>
        <div className="my-6">
          <TextEditor editor={editor}>
            <HelpButton />
          </TextEditor>
        </div>

        <div>
          <Subtitle>Buy views</Subtitle>
          <AmountInput
            amount={totalFunds}
            onChange={setTotalFunds}
            label={ENV_CONFIG.moneyMoniker}
            disabled={createAdMutation.isLoading}
          />

          <div className="mt-2">
            Buying {numViews} views at {formatMoney(PRICE_PER_USER)} per user
          </div>
        </div>

        <Button
          onClick={() => createAdMutation.mutate()}
          disabled={numViews === 0}
          loading={createAdMutation.isLoading}
          className="mt-10"
        >
          Create
        </Button>

        {createAdMutation.isError && (
          <div className="text-scarlet-500">
            {JSON.stringify(createAdMutation.error as any)}
          </div>
        )}
      </div>
    </Page>
  )
}

function HelpButton() {
  //actually a link
  return (
    <Tooltip text="Formatting Help">
      <a
        href="https://help.manifold.markets/manifold-101/markdown-text-formatting"
        target="_blank"
        className="text-ink-400 hover:text-ink-600 active:bg-ink-300 flex h-full w-12 items-center justify-center"
      >
        <QuestionMarkCircleIcon className="h-5 w-5" />
      </a>
    </Tooltip>
  )
}
