import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { SearchIcon } from '@heroicons/react/outline'

type SearchEntry = {
  page: string
  section: string
  text: string
  href: string
}

// Add new entries here when adding new guidelines pages or sections
export const GUIDELINES_SEARCH_INDEX: SearchEntry[] = [
  // Main page
  {
    page: 'Community Guidelines',
    section: 'Short Version',
    text: 'be excellent to each other exploit bonuses bugs loopholes markets resolve honestly promptly report security issues guidelines not a contract act in good faith',
    href: '/community-guidelines#short-version',
  },

  // Accounts & Market Manipulation
  {
    page: 'Accounts & Market Manipulation',
    section: 'General account rules',
    text: 'impersonating person group organization username changed nsfw profile pictures nudity extreme violence ban evasion alts harvest bonuses subsidies manipulate markets',
    href: '/community-guidelines/accounts#general-account-rules',
  },
  {
    page: 'Accounts & Market Manipulation',
    section: 'Alt accounts',
    text: 'multiple accounts bot tag mods admin handle bio pseudonymous account predictions identity alts name bio benefit main account',
    href: '/community-guidelines/accounts#alt-accounts',
  },
  {
    page: 'Accounts & Market Manipulation',
    section: 'Market manipulation',
    text: 'punishment alts friends accounts collusion unique trader bonus funneling mana referral signup bonuses daily streaks fake identities deceive manipulate market resolution coordinate trades prices odds leaderboard exploiting manifold bugs laws terms of service',
    href: '/community-guidelines/accounts#market-manipulation',
  },
  {
    page: 'Accounts & Market Manipulation',
    section: 'Insider trading',
    text: 'trading private information markets accurate duty employer public commitment trade caveat emptor',
    href: '/community-guidelines/accounts#insider-trading',
  },

  // Bots
  {
    page: 'Bots',
    section: 'Marking an account as a bot',
    text: 'mark account bot profile settings cog account settings api key permanent moderator automated trading bot api script how to make a bot',
    href: '/community-guidelines/bots#marking-an-account-as-a-bot',
  },
  {
    page: 'Bots',
    section: 'What changes when you become a bot',
    text: 'bot badge silicon division leagues unique trader bonuses importance score bettor bonuses excluded count counts toward',
    href: '/community-guidelines/bots#what-changes-when-you-become-a-bot',
  },
  {
    page: 'Bots',
    section: 'Separate your human and bot accounts',
    text: 'separate primary account bot account dedicated automated trading reduction removal bonus eligibility alts',
    href: '/community-guidelines/bots#separate-your-human-and-bot-accounts',
  },
  {
    page: 'Bots',
    section: 'Verification and prizes',
    text: 'bot accounts no identity verification kyc silicon league prize convert send main account prize drawings',
    href: '/community-guidelines/bots#verification-and-prizes',
  },

  // Resolving Markets
  {
    page: 'Resolving Markets',
    section: 'Creator resolution',
    text: 'resolve market criteria met un-resolve re-resolve mistake 10 minutes fine ban mods admin re-resolution',
    href: '/community-guidelines/resolving-markets#creator-resolution',
  },
  {
    page: 'Resolving Markets',
    section: 'When Manifold can override you',
    text: 'manifold mods override unresponsive ambiguous disputed traders cede decision position fraudulent re-resolve n/a ambiguity',
    href: '/community-guidelines/resolving-markets#when-manifold-can-override',
  },
  {
    page: 'Resolving Markets',
    section: 'Abandoned markets',
    text: 'inactive unambiguous resolution criteria moderator resolve mod guidelines',
    href: '/community-guidelines/resolving-markets#abandoned-markets',
  },

  // Leagues
  {
    page: 'Leagues',
    section: 'What counts toward your score',
    text: 'profit ranked markets unranked own markets 1 hour delay creator pump and dump',
    href: '/community-guidelines/leagues#what-counts',
  },
  {
    page: 'Leagues',
    section: 'Divisions and movement',
    text: 'seven divisions silicon bronze silver gold platinum diamond masters promotion demotion season cohort',
    href: '/community-guidelines/leagues#divisions',
  },
  {
    page: 'Leagues',
    section: 'Prizes',
    text: 'prizes season end divisions ranks identity verification kyc silicon bots 100 mana one prize per season',
    href: '/community-guidelines/leagues#prizes',
  },
  {
    page: 'Leagues',
    section: 'What gets your prize pulled',
    text: 'prize withheld reduced recalled manipulating manipulate manipulation cheating cheat misresolving refunding refund counterparties counterparty wash trading collusion coordinating trades alts bots forfeiture',
    href: '/community-guidelines/leagues#prize-forfeiture',
  },

  // Platform Conduct
  {
    page: 'Platform Conduct',
    section: 'Mana & money',
    text: 'selling mana real money not allowed',
    href: '/community-guidelines/platform-conduct#mana-and-money',
  },
  {
    page: 'Platform Conduct',
    section: 'Messaging',
    text: 'unsolicited promotional direct messages spam ban',
    href: '/community-guidelines/platform-conduct#messaging',
  },
  {
    page: 'Platform Conduct',
    section: 'Reviews',
    text: 'threatening user poor resolution rating warnings suspension creator privileges ban leaving frequent inaccurate reviews disciplinary action',
    href: '/community-guidelines/platform-conduct#reviews',
  },
  {
    page: 'Platform Conduct',
    section: 'Reporting & feedback',
    text: 'rule broken flag team discord email report',
    href: '/community-guidelines/platform-conduct#reporting-and-feedback',
  },

  // Market Policies (these sections used to live on Running a Market —
  // links and labels updated when the content moved.)
  {
    page: 'Market Policies',
    section: 'Market states',
    text: 'ranked unlisted two states admins moderators',
    href: '/community-guidelines/market-policies#market-states',
  },
  {
    page: 'Market Policies',
    section: 'Ranked',
    text: 'ranked default leagues unranked unlisted self-referential random gambling coin flip personal creator friends predict never resolved',
    href: '/community-guidelines/market-policies#ranked',
  },
  {
    page: 'Market Policies',
    section: 'Subsidized',
    text: 'subsidized mana unique trader 50 traders cap 10000 liquidity subsidy house unsubsidized unlisted self-referential random gambling spam low quality duplicate',
    href: '/community-guidelines/market-policies#subsidized',
  },
  {
    page: 'Market Policies',
    section: "Markets that may be unlisted, N/A'd, or deleted",
    text: 'unlisted direct url n/a deleted abandoned vague criteria sexually graphic violence terrorism abuse hateful race gender sex disability spoilers random gambling self-referential low quality harvest bonuses defraud server costs doxxing illegal us law minors sexual exploitation blackmail spam self-harm suicide exploit codebase bugs third party terms of service',
    href: '/community-guidelines/market-policies#unlisted-na-deleted',
  },
  {
    page: 'Market Policies',
    section: 'A note on third-party platforms',
    text: 'metaculus tournament questions community prediction hidden terms of service external forecasting topics twitter data breach',
    href: '/community-guidelines/market-policies#third-party-platforms',
  },
  {
    page: 'Market Policies',
    section: 'Personal markets',
    text: 'personal goal markets n/a resolve upfront description reserve right unranked creator participating private matters inactive',
    href: '/community-guidelines/market-policies#personal-markets',
  },

  // Comment Guidelines
  {
    page: 'Comment Guidelines',
    section: 'How comment hiding works',
    text: 'market creators hide comment discretion hidden publicly accessible comment hidden message not deleted moderators admins',
    href: '/community-guidelines/comment-guidelines#comment-hiding',
  },
  {
    page: 'Comment Guidelines',
    section: "What's not allowed",
    text: 'spam hateful discriminatory content harassment doxxing private information illegal us law automated bot comments low-effort repetitive reported mod alert posting ban banned promoting own markets traffic',
    href: '/community-guidelines/comment-guidelines#whats-not-allowed',
  },
  {
    page: 'Comment Guidelines',
    section: 'What can get you banned',
    text: 'restriction ban banned severity history repeated violations offenses spam harassment doxxing',
    href: '/community-guidelines/comment-guidelines#what-can-get-you-banned',
  },

  // Prize Drawings FAQ
  {
    page: 'Prize Drawing FAQ',
    section: 'How do I enter?',
    text: 'opt-in 1000 mana invested free entry purchase convert bonding curve',
    href: '/community-guidelines/prize-drawings-faq#how-to-enter',
  },
  {
    page: 'Prize Drawing FAQ',
    section: 'Who can enter?',
    text: '18 years old 1000 mana invested one account eligible location restricted employee family',
    href: '/community-guidelines/prize-drawings-faq#eligibility',
  },
  {
    page: 'Prize Drawing FAQ',
    section: 'Restricted locations',
    text: 'us states ontario canada australia germany netherlands russia restricted countries not eligible',
    href: '/community-guidelines/prize-drawings-faq#restricted-locations',
  },
  {
    page: 'Prize Drawing FAQ',
    section: 'What are the prizes?',
    text: 'usdc stablecoin us dollar multiple prizes one winner 5 days wallet address forfeited charity alternate winner',
    href: '/community-guidelines/prize-drawings-faq#prizes',
  },
  {
    page: 'Prize Drawing FAQ',
    section: 'Do I need a crypto wallet?',
    text: 'crypto wallet usdc metamask trust wallet private key seed phrase recovery phrase token fraudulent',
    href: '/community-guidelines/prize-drawings-faq#wallets',
  },
  {
    page: 'Prize Drawing FAQ',
    section: 'How are winners selected?',
    text: 'provably fair bitcoin blockchain sha-256 hashing transparent equal probability free purchased',
    href: '/community-guidelines/prize-drawings-faq#winner-selection',
  },
  {
    page: 'Prize Drawing FAQ',
    section: 'What about taxes?',
    text: 'taxable income tax professional obligations',
    href: '/community-guidelines/prize-drawings-faq#taxes',
  },
  {
    page: 'Prize Drawing FAQ',
    section: 'What can get me disqualified?',
    text: 'disqualified bonus harvesting multiple accounts misresolving markets bots automated vpn location false information suspicious activity terms of service',
    href: '/community-guidelines/prize-drawings-faq#disqualification',
  },

  // Prize Drawings Rules
  {
    page: 'Prize Drawing Rules',
    section: 'Eligibility',
    text: 'eligible 18 years old age majority valid manifold account good standing restricted territory us states canadian provinces countries employee family banned',
    href: '/community-guidelines/prize-drawings-rules#eligibility',
  },
  {
    page: 'Prize Drawing Rules',
    section: 'Entry methods',
    text: 'free entry earned entries mana predictions bonuses equal chance selected winner',
    href: '/community-guidelines/prize-drawings-rules#entry-methods',
  },
  {
    page: 'Prize Drawing Rules',
    section: 'Prizes',
    text: 'usdc stablecoin cryptocurrency wallet blockchain fees tax compliance prizes awarded',
    href: '/community-guidelines/prize-drawings-rules#prizes',
  },
  {
    page: 'Prize Drawing Rules',
    section: 'Winner requirements',
    text: 'wallet address 5 calendar days notification identity verification tax documentation forfeiture',
    href: '/community-guidelines/prize-drawings-rules#winner-requirements',
  },
  {
    page: 'Prize Drawing Rules',
    section: 'Prohibited conduct',
    text: 'disqualification multiple accounts bonus harvesting bots automated manipulation collusion false information vpn geographic restrictions terms of service',
    href: '/community-guidelines/prize-drawings-rules#prohibited-conduct',
  },
  {
    page: 'Prize Drawing Rules',
    section: 'Liability',
    text: 'liability limited prize value $100 disputes arbitration san francisco full rules terms',
    href: '/community-guidelines/prize-drawings-rules#liability',
  },

  // Moderation
  {
    page: 'Moderation',
    section: 'What Mods do',
    text: 'markets resolved promptly accurately clarify ambiguous creators unresponsive warnings bans guideline violations example community',
    href: '/community-guidelines/moderation#what-mods-do',
  },
  {
    page: 'Moderation',
    section: 'Who Mods are',
    text: 'active manifold users community manager moderator open-minded fair discord mod-help mods site tag status removed reinstated inactivity conduct become candidate apply join new mods selected how to become a mod',
    href: '/community-guidelines/moderation#who-mods-are',
  },
  {
    page: 'Moderation',
    section: 'Actions Mods can take',
    text: 'warnings mod alerts anonymous banners restrictions posting market control trading bans hide delete comments unlist unrank edit titles descriptions resolve unresolve closing dates pin comments permanent bans admins',
    href: '/community-guidelines/moderation#actions-mods-can-take',
  },
  {
    page: 'Moderation',
    section: 'How to request mod help',
    text: 'request mod help resolve market comment source reasoning active inactive month ping wait 24 hours mods tag flag queue',
    href: '/community-guidelines/moderation#how-to-request-mod-help',
  },
  {
    page: 'Moderation',
    section: 'How market resolution works',
    text: 'unambiguous disputed ownership comment proposed criteria 48 hours respond reclaim blatantly wrong defensible n/a last resort ambiguity',
    href: '/community-guidelines/moderation#how-market-resolution-works',
  },
  {
    page: 'Moderation',
    section: 'If you think a Mod decision was wrong',
    text: 'disagree discord email large markets blowback shankypanky appeal',
    href: '/community-guidelines/moderation#if-you-think-a-mod-decision-was-wrong',
  },
]

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'i',
  'me',
  'my',
  'we',
  'you',
  'your',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'do',
  'does',
  'did',
  'of',
  'to',
  'for',
  'in',
  'on',
  'and',
  'or',
  'but',
  'so',
  'if',
  'then',
  'than',
  'as',
  'at',
  'by',
  'with',
  'what',
  'when',
  'where',
  'why',
  'how',
  'who',
  'can',
  'should',
  'would',
  'could',
  'will',
  'get',
  'got',
  'gets',
  'getting',
  'happen',
  'happens',
  'happened',
  'have',
  'has',
  'had',
])

export function GuidelinesSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))

  const results =
    words.length === 0
      ? []
      : GUIDELINES_SEARCH_INDEX.filter((entry) => {
          const haystack =
            `${entry.page} ${entry.section} ${entry.text}`.toLowerCase()
          return words.every((word) => haystack.includes(word))
        }).slice(0, 8)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative mt-6 w-full">
      <div className="border-ink-200 bg-canvas-0 focus-within:border-primary-400 flex items-center gap-2 rounded-xl border-2 px-4 py-2.5">
        <SearchIcon className="text-ink-400 h-4 w-4 shrink-0" />
        <input
          type="text"
          placeholder="Search guidelines..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              setQuery('')
            }
          }}
          className="text-ink-900 placeholder-ink-400 w-full border-0 bg-transparent p-0 text-sm outline-none focus:ring-0"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setOpen(false)
            }}
            className="text-ink-400 hover:text-ink-600"
          >
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="border-ink-200 bg-canvas-0 absolute z-50 mt-1 w-full rounded-xl border-2 shadow-lg">
          {results.map((result, i) => (
            <button
              key={i}
              onClick={() => {
                router.push(result.href)
                setOpen(false)
                setQuery('')
              }}
              className="hover:bg-canvas-50 flex w-full flex-col px-4 py-3 text-left first:rounded-t-xl last:rounded-b-xl"
            >
              <span className="text-primary-500 text-xs">{result.page}</span>
              <span className="text-ink-900 text-sm font-medium">
                {result.section}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && words.length > 0 && results.length === 0 && (
        <div className="border-ink-200 bg-canvas-0 absolute z-50 mt-1 w-full rounded-xl border-2 px-4 py-3 shadow-lg">
          <p className="text-ink-500 text-sm">No results found.</p>
        </div>
      )}
    </div>
  )
}
