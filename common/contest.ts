import { GROUP_CHAT_SLUG } from 'common/group'

export const CONTEST_DATA = {
  'cause-exploration-prize': {
    link: 'https://www.causeexplorationprizes.com/',
    description:
      'Open Philanthropy’s contest to find ideas for the best ways to use their resources, with focus on new areas to support, health development, and worldview investigations.',
  },
}

export const CONTEST_SLUGS = Object.keys(CONTEST_DATA)

export function contestPath(
  contestSlug: string,
  subpath?:
    | 'edit'
    | 'markets'
    | 'about'
    | typeof GROUP_CHAT_SLUG
    | 'leaderboards'
) {
  return `/contest/${contestSlug}${subpath ? `/${subpath}` : ''}`
}
