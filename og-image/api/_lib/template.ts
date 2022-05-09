import { sanitizeHtml } from './sanitizer'
import { ParsedRequest } from './types'

function getCss(theme: string, fontSize: string) {
  let background = 'white'
  let foreground = 'black'
  let radial = 'lightgray'

  if (theme === 'dark') {
    background = 'black'
    foreground = 'white'
    radial = 'dimgray'
  }
  // To use Readex Pro: `font-family: 'Readex Pro', sans-serif;`
  return `
    @import url('https://fonts.googleapis.com/css2?family=Major+Mono+Display&family=Readex+Pro:wght@400;700&display=swap');

    body {
        background: ${background};
        background-image: radial-gradient(circle at 25px 25px, ${radial} 2%, transparent 0%), radial-gradient(circle at 75px 75px, ${radial} 2%, transparent 0%);
        background-size: 100px 100px;
        height: 100vh;
        font-family: "Readex Pro", sans-serif;
    }

    code {
        color: #D400FF;
        font-family: 'Vera';
        white-space: pre-wrap;
        letter-spacing: -5px;
    }

    code:before, code:after {
        content: '\`';
    }

    .logo-wrapper {
        display: flex;
        align-items: center;
        align-content: center;
        justify-content: center;
        justify-items: center;
    }

    .logo {
        margin: 0 75px;
    }

    .plus {
        color: #BBB;
        font-family: Times New Roman, Verdana;
        font-size: 100px;
    }

    .spacer {
        margin: 150px;
    }

    .emoji {
        height: 1em;
        width: 1em;
        margin: 0 .05em 0 .1em;
        vertical-align: -0.1em;
    }
    
    .heading {
        font-family: 'Major Mono Display', monospace;
        font-size: ${sanitizeHtml(fontSize)};
        font-style: normal;
        color: ${foreground};
        line-height: 1.8;
    }
    
    .font-major-mono {
      font-family: "Major Mono Display", monospace;
    }

    .text-primary {
      color: #11b981;
    }
    `
}

export function getHtml(parsedReq: ParsedRequest) {
  const {
    theme,
    fontSize,
    question,
    probability,
    metadata,
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
  } = parsedReq
  const MAX_QUESTION_CHARS = 100
  const truncatedQuestion =
    question.length > MAX_QUESTION_CHARS
      ? question.slice(0, MAX_QUESTION_CHARS) + '...'
      : question
  const hideAvatar = creatorAvatarUrl ? '' : 'hidden'
  return `<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <title>Generated Image</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <style>
        ${getCss(theme, fontSize)}
    </style>
  <body>
    <div class="px-24">
      <!-- Profile image -->
      <div class="absolute left-24 top-8">
        <div class="flex flex-row align-bottom gap-6">
          <img
            class="h-24 w-24 rounded-full bg-white flex items-center justify-center ${hideAvatar}"
            src="${creatorAvatarUrl}"
            alt=""
          />
          <div class="flex flex-col gap-2">
            <p class="text-gray-900 text-3xl">${creatorName}</p>
            <p class="text-gray-500 text-3xl">@${creatorUsername}</p>
          </div>
        </div>
      </div>

      <!-- Mantic logo -->
      <div class="absolute right-24 top-8">
        <a class="flex flex-row gap-3" href="/"
          ><img
            class="sm:h-12 sm:w-12"
            src="https:&#x2F;&#x2F;manifold.markets&#x2F;logo.png"
            width="40"
            height="40"
          />
          <div
            class="hidden sm:flex font-major-mono lowercase mt-1 sm:text-3xl md:whitespace-nowrap"
          >
            Manifold Markets
          </div></a
        >
      </div>

      <div class="flex flex-row justify-between gap-12 pt-36">
        <div class="text-indigo-700 text-6xl leading-tight">
          ${truncatedQuestion}
        </div>
        <div class="flex flex-col text-primary">
          <div class="text-8xl">${probability}</div>
          <div class="text-4xl">${probability !== '' ? 'chance' : ''}</div>
        </div>
      </div>

      <!-- Metadata -->
      <div class="absolute bottom-16">
        <div class="text-gray-500 text-3xl">
          ${metadata}
        </div>
      </div>
    </div>
  </body>
</html>`
}
