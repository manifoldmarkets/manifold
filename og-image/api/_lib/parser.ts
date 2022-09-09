import { IncomingMessage } from 'http'
import { parse } from 'url'
import { ParsedRequest } from './types'

export function parseRequest(req: IncomingMessage) {
  console.log('HTTP ' + req.url)
  const { pathname, query } = parse(req.url || '/', true)
  const {
    fontSize,
    images,
    widths,
    heights,
    theme,
    md,

    // Attributes for Manifold card:
    question,
    probability,
    numericValue,
    metadata,
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
    resolution,

    // Challenge attributes:
    challengerAmount,
    challengerOutcome,
    creatorAmount,
    creatorOutcome,
    acceptedName,
    acceptedAvatarUrl,
  } = query || {}

  if (Array.isArray(fontSize)) {
    throw new Error('Expected a single fontSize')
  }
  if (Array.isArray(theme)) {
    throw new Error('Expected a single theme')
  }

  const arr = (pathname || '/').slice(1).split('.')
  let extension = ''
  let text = ''
  if (arr.length === 0) {
    text = ''
  } else if (arr.length === 1) {
    text = arr[0]
  } else {
    extension = arr.pop() as string
    text = arr.join('.')
  }

  // Take a url query param and return a single string
  const getString = (stringOrArray: string[] | string | undefined): string => {
    if (Array.isArray(stringOrArray)) {
      // If the query param is an array, return the first element
      return stringOrArray[0]
    }
    return stringOrArray || ''
  }

  const parsedRequest: ParsedRequest = {
    fileType: extension === 'jpeg' ? extension : 'png',
    text: decodeURIComponent(text),
    theme: theme === 'dark' ? 'dark' : 'light',
    md: md === '1' || md === 'true',
    fontSize: fontSize || '96px',
    images: getArray(images),
    widths: getArray(widths),
    heights: getArray(heights),

    question:
      getString(question) || 'Will you create a prediction market on Manifold?',
    resolution: getString(resolution),
    probability: getString(probability),
    numericValue: getString(numericValue) || '',
    metadata: getString(metadata) || 'Jan 1 &nbsp;•&nbsp; M$ 123 pool',
    creatorName: getString(creatorName) || 'Manifold Markets',
    creatorUsername: getString(creatorUsername) || 'ManifoldMarkets',
    creatorAvatarUrl: getString(creatorAvatarUrl) || '',
    challengerAmount: getString(challengerAmount) || '',
    challengerOutcome: getString(challengerOutcome) || '',
    creatorAmount: getString(creatorAmount) || '',
    creatorOutcome: getString(creatorOutcome) || '',
    acceptedName: getString(acceptedName) || '',
    acceptedAvatarUrl: getString(acceptedAvatarUrl) || '',
  }
  parsedRequest.images = getDefaultImages(parsedRequest.images)
  return parsedRequest
}

function getArray(stringOrArray: string[] | string | undefined): string[] {
  if (typeof stringOrArray === 'undefined') {
    return []
  } else if (Array.isArray(stringOrArray)) {
    return stringOrArray
  } else {
    return [stringOrArray]
  }
}

function getDefaultImages(images: string[]): string[] {
  const defaultImage = 'https://manifold.markets/logo.png'

  if (!images || !images[0]) {
    return [defaultImage]
  }
  return images
}
