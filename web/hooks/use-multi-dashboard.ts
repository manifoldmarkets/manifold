import { createRef, useEffect, useRef, useState } from 'react'
import { keyBy, mapValues } from 'lodash'
import { useEvent } from 'web/hooks/use-event'
import router from 'next/router'
import { Headline } from 'common/news'

export const useMultiDashboard = (
  headlines: Headline[],
  endpoint: string,
  topSlug: string
) => {
  const [currentSlug, setCurrentSlug] = useState<string>('')
  const [ignoreScroll, setIgnoreScroll] = useState(false)

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
      setShallowSlugInRouter(lastSlugPosition.slug)
    }
  })

  const onClick = (slug: string) => {
    setIgnoreScroll(true)
    setShallowSlugInRouter(slug)
    setCurrentSlug(slug)
    headlineSlugsToRefs.current[slug].current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    setTimeout(() => setIgnoreScroll(false), 1000)
  }

  const setShallowSlugInRouter = (slug: string) => {
    if (slug === topSlug) {
      if (router.asPath.split('?')[0] !== `/${endpoint}`) {
        // don't override query string
        router.replace(`/${endpoint}`, undefined, {
          shallow: true,
        })
      }
    } else {
      router.replace(`/${endpoint}/${slug}`, undefined, {
        shallow: true,
      })
    }
  }
  return {
    currentSlug,
    onClick,
    headlineSlugsToRefs,
  }
}
