import {
  ELECTION_DASHBOARD_DESCRIPTION,
  ELECTION_DASHBOARD_TITLE,
  ElectionsPageProps,
  NewsDashboardPageProps,
  SuccesNewsDashboardPageProps,
} from 'common/politics/elections-data'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import type { Headline } from 'common/news'
import { useUser } from 'web/hooks/use-user'
import { Carousel } from 'web/components/widgets/carousel'
import { isAdminId, isModId } from 'common/envs/constants'
import { EditNewsButton } from 'web/components/news/edit-news-button'
import { track } from 'web/lib/service/analytics'
import clsx from 'clsx'
import router from 'next/router'
import { capitalize, first, keyBy, mapValues } from 'lodash'
import { createRef, useEffect, useRef, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { getDashboardProps } from 'web/lib/politics/news-dashboard'
import { USElectionsPage } from 'web/components/elections-page'
import Custom404 from 'web/pages/404'
import NewsPage from 'web/pages/news/[slug]'
import { useEvent } from 'web/hooks/use-event'
import { PoliticsDashboardPage } from 'web/components/dashboard/politics-dashboard-page'
export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const revalidate = 60
export async function getStaticProps(props: { params: { slug: string[] } }) {
  const slug = first(props.params.slug)
  if (slug) {
    try {
      const props = await getDashboardProps(slug, true)
      return {
        props,
        revalidate,
      }
    } catch (e) {
      return {
        props: { state: 'not found' },
        revalidate,
      }
    }
  }
  const electionsPageProps = await getElectionsPageProps()
  return {
    props: electionsPageProps,
    revalidate,
  }
}

export default function ElectionsOrDashboardPage(
  props: ElectionsPageProps | NewsDashboardPageProps
) {
  // Unknown politics dashboard
  if ('state' in props && props.state === 'not found') {
    return <Custom404 />
  }
  // Politics dashboard
  if ('initialDashboard' in props) {
    return <NewsPage {...props} endpoint={'politics'} />
  }
  // Elections home page
  return <Elections {...props} />
}

export const TOP_SLUG = 'home'
const MAX_DASHBOARDS = 8
function Elections(props: ElectionsPageProps) {
  const [currentSlug, setCurrentSlug] = useState<string>('')
  const [ignoreScroll, setIgnoreScroll] = useState(false)
  // TODO: Lots of INSUFFICIENT_RESOURCES errors when trying to render all newsDashboards
  const newsDashboards = props.newsDashboards.slice(0, MAX_DASHBOARDS)
  const headlines = [
    {
      id: TOP_SLUG,
      slug: TOP_SLUG,
      title: capitalize(TOP_SLUG),
    },
  ].concat(props.headlines.slice(0, MAX_DASHBOARDS))

  const headlineSlugsToRefs = useRef(
    mapValues(keyBy(headlines, 'slug'), () => createRef<HTMLDivElement>())
  )

  useEffect(() => {
    window.addEventListener('scroll', checkScrollPositionToHighlightSlug)
    checkScrollPositionToHighlightSlug()
    return () => {
      window.removeEventListener('scroll', checkScrollPositionToHighlightSlug)
    }
  }, [])

  const checkScrollPositionToHighlightSlug = useEvent(() => {
    if (ignoreScroll) return
    let lastSlugPosition = {
      slug: '',
      height: 0,
    }
    Object.entries(headlineSlugsToRefs.current).forEach(([slug, divRef]) => {
      if (!divRef.current) return
      const divTop = divRef.current.getBoundingClientRect().top
      if (divTop < window.innerHeight && divTop > lastSlugPosition.height) {
        lastSlugPosition = {
          slug,
          height: divTop,
        }
      }
    })
    if (lastSlugPosition.slug !== '' && lastSlugPosition.slug !== currentSlug) {
      setCurrentSlug(lastSlugPosition.slug)
    }
  })

  const onClick = (slug: string) => {
    setIgnoreScroll(true)
    if (slug === TOP_SLUG) {
      router.push(`/politics`, undefined, {
        shallow: true,
      })
    } else {
      router.push(`/politics/${slug}`, undefined, {
        shallow: true,
      })
    }
    setCurrentSlug(slug)
    headlineSlugsToRefs.current[slug].current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    setTimeout(() => setIgnoreScroll(false), 1000)
  }

  return (
    <Page trackPageView="us elections page 2024">
      <HeadlineTabs
        headlines={headlines}
        currentSlug={currentSlug}
        onClick={onClick}
      />

      <SEO
        title={ELECTION_DASHBOARD_TITLE}
        description={ELECTION_DASHBOARD_DESCRIPTION}
        // TODO: add a nice preview image
      />
      <div
        className="absolute top-1"
        ref={headlineSlugsToRefs.current[TOP_SLUG]}
      />
      <USElectionsPage {...props} />
      {newsDashboards.map((dashboard) =>
        dashboard.state === 'not found' ? null : (
          <Col className={'relative my-4'} key={dashboard.slug + 'section'}>
            <div
              className={'absolute -top-12'}
              ref={headlineSlugsToRefs.current[dashboard.slug]}
            />
            <PoliticsDashboardPage
              {...(dashboard as SuccesNewsDashboardPageProps)}
              editByDefault={false}
              embeddedInParent={true}
              endpoint={'politics'}
              className="!max-w-none"
            />
          </Col>
        )
      )}
    </Page>
  )
}

function HeadlineTabs(props: {
  headlines: Headline[]
  currentSlug: string
  onClick: (slug: string) => void
}) {
  const { headlines, currentSlug, onClick } = props
  const user = useUser()

  return (
    <div className="bg-canvas-50 sticky top-0 z-50 mb-3 w-full">
      <Carousel labelsParentClassName="gap-px">
        {headlines.map(({ id, slug, title }) => (
          <Tab
            key={id}
            label={title}
            onClick={() => onClick(slug)}
            active={slug === currentSlug}
          />
        ))}
        {user && (isAdminId(user.id) || isModId(user.id)) && (
          <EditNewsButton
            defaultDashboards={headlines.filter(
              (headline) => headline.slug !== TOP_SLUG
            )}
            isPolitics={true}
          />
        )}
      </Carousel>
    </div>
  )
}

const Tab = (props: {
  onClick: () => void
  label: string
  active?: boolean
}) => {
  const { onClick, label, active } = props
  return (
    <span
      onClick={() => {
        track('politics news tabs', { tab: label })
        onClick()
      }}
      className={clsx(
        'text-ink-600 hover:bg-primary-100 hover:text-primary-700 focus-visible:bg-primary-100 focus-visible:text-primary-700 max-w-[40ch] cursor-pointer text-ellipsis whitespace-nowrap px-3 py-2 text-sm font-bold outline-none',
        active && 'bg-primary-200 text-primary-900'
      )}
    >
      {label}
    </span>
  )
}
