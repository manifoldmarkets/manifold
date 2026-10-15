import { ReactNode } from 'react'
import { AnySportKey } from 'common/sports-schedule'

/** Decorative sport identity, independent of teams, answers, or results. */
export function SportHeroBackground({ sport }: { sport?: AnySportKey }) {
  return (
    <svg
      viewBox="0 0 280 140"
      aria-hidden="true"
      focusable="false"
      className="text-primary-600 pointer-events-none absolute -bottom-3 -right-4 -z-10 h-28 w-56 select-none opacity-[0.08] sm:right-3 sm:h-36 sm:w-72 sm:opacity-[0.12]"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <SportArtwork sport={sport} />
    </svg>
  )
}

function Ball({ children }: { children: ReactNode }) {
  return (
    <g>
      <circle cx="180" cy="75" r="53" fill="currentColor" fillOpacity="0.12" />
      {children}
    </g>
  )
}

function SportArtwork({ sport }: { sport?: AnySportKey }) {
  switch (sport) {
    case 'f1':
      return (
        <g>
          <path d="M9 76H35M2 88H26M13 100H32" strokeWidth="2" />
          <path
            d="M43 82 52 62H103L122 44H147L175 65 223 76 258 82V94H39Z"
            fill="currentColor"
            fillOpacity="0.45"
          />
          <path d="M86 98H204M90 80 110 64H158L182 78 219 84M41 64 36 43M29 39H73V47H29ZM242 89H269V96H242Z" />
          <path d="M116 58C115 43 139 39 149 50L158 62" strokeWidth="5" />
          <path d="M132 48V62M146 65H161" />
          <circle cx="66" cy="91" r="23" fill="currentColor" />
          <circle cx="224" cy="93" r="20" fill="currentColor" />
          <circle
            cx="66"
            cy="91"
            r="12"
            className="stroke-primary-50"
            strokeWidth="3"
          />
          <circle
            cx="224"
            cy="93"
            r="10"
            className="stroke-primary-50"
            strokeWidth="3"
          />
        </g>
      )
    case 'nfl':
    case 'ncaaf':
      return (
        <g transform="rotate(-25 178 75)">
          <path
            d="M99 75Q178-14 257 75 178 164 99 75Z"
            fill="currentColor"
            fillOpacity="0.2"
          />
          <path d="M122 54Q131 75 122 96M234 54Q225 75 234 96M154 75H202M160 67V83M172 67V83M184 67V83M196 67V83" />
        </g>
      )
    case 'nba':
    case 'ncaab':
      return (
        <Ball>
          <path d="M127 75H233M180 22V128M142 38Q205 75 142 112M218 38Q155 75 218 112" />
        </Ball>
      )
    case 'soccer':
      return (
        <Ball>
          <path
            d="m180 51 23 16-9 27h-28l-9-27Z"
            fill="currentColor"
            fillOpacity="0.45"
          />
          <path d="M180 51V22M203 67 230 58M194 94 212 117M166 94 148 117M157 67 130 58M151 30 159 35 180 22 201 35 209 30M130 92 138 80 130 58M230 92 222 80 230 58M164 125 174 113H186L196 125" />
        </Ball>
      )
    case 'mlb':
      return (
        <Ball>
          <path d="M145 35Q188 75 145 115M215 35Q172 75 215 115" />
          <path
            d="m150 45 9-3m-1 14 10-2m-6 15h10m-11 14 10 2m-17 11 9 3m-15 7 8 4m53-61-9-3m1 14-10-2m6 15h-10m11 14-10 2m17 11-9 3m15 7-8 4"
            strokeWidth="2"
          />
        </Ball>
      )
    case 'tennis':
      return (
        <g transform="rotate(30 175 72)">
          <ellipse
            cx="172"
            cy="53"
            rx="35"
            ry="43"
            fill="currentColor"
            fillOpacity="0.12"
          />
          <path
            d="M154 17V89M166 11V95M178 11V95M190 17V89M140 33H204M138 47H207M138 61H207M144 75H201M156 92 166 112H178L188 92M172 113V137"
            strokeWidth="2"
          />
          <path d="M172 118V136" strokeWidth="10" />
          <circle cx="232" cy="88" r="17" />
          <path d="M223 74Q241 88 223 102" strokeWidth="2" />
        </g>
      )
    case 'nhl':
      return (
        <g>
          <path
            d="M132 16 190 112H227Q239 112 238 102L204 100 147 10ZM223 15 165 112H128Q116 112 117 102L151 100 208 9Z"
            fill="currentColor"
            fillOpacity="0.2"
          />
          <ellipse cx="179" cy="119" rx="24" ry="7" fill="currentColor" />
          <path d="M155 119V126Q179 138 203 126V119" fill="currentColor" />
        </g>
      )
    case 'golf':
      return (
        <g>
          <ellipse
            cx="177"
            cy="118"
            rx="58"
            ry="10"
            fill="currentColor"
            fillOpacity="0.15"
          />
          <path
            d="M177 117V13L224 31 177 51"
            fill="currentColor"
            fillOpacity="0.25"
          />
          <circle cx="224" cy="100" r="15" />
          <path d="M218 95h.1M228 94h.1M224 104h.1" strokeWidth="3" />
        </g>
      )
    case 'cricket':
      return (
        <g transform="rotate(25 174 72)">
          <path
            d="M158 43H188V112Q173 125 158 112Z"
            fill="currentColor"
            fillOpacity="0.25"
          />
          <path d="M173 43V8" strokeWidth="10" />
          <circle
            cx="226"
            cy="89"
            r="19"
            fill="currentColor"
            fillOpacity="0.15"
          />
          <path
            d="M217 72Q231 89 217 106M223 71Q237 89 223 107"
            strokeWidth="2"
          />
        </g>
      )
    case 'mma':
      return (
        <g transform="rotate(-15 179 77)">
          <path
            d="M144 91Q128 85 130 69L135 57Q140 48 149 55L154 62V41Q154 22 169 22H192Q215 22 215 45V70Q215 91 202 104H152Z"
            fill="currentColor"
            fillOpacity="0.25"
          />
          <path d="M153 102H202V126H153ZM154 62 166 74M174 26V44M190 26V44" />
        </g>
      )
    case 'athletics':
      return (
        <g>
          <circle cx="190" cy="28" r="12" fill="currentColor" />
          <path
            d="m182 48-26 25 25 23-28 32m24-70 28 18 27-12m-54 22-34 8-28 27m40-48-11-20-26 12"
            strokeWidth="10"
          />
          <path d="M100 125H248M91 136H256" strokeWidth="2" />
        </g>
      )
    default:
      return (
        <g>
          <path
            d="M150 21H211V54Q211 83 181 90 150 83 150 54Z"
            fill="currentColor"
            fillOpacity="0.2"
          />
          <path d="M150 33H130V47Q130 69 155 71M211 33H231V47Q231 69 206 71M181 90V115M158 125H204M166 115H196V125" />
        </g>
      )
  }
}
