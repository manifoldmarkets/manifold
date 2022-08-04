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

export function getChallengeHtml(parsedReq: ParsedRequest) {
  const {
    theme,
    fontSize,
    question,
    creatorName,
    creatorAvatarUrl,
    challengerAmount,
    challengerOutcome,
    creatorAmount,
    creatorOutcome,
    acceptedName,
    acceptedAvatarUrl,
  } = parsedReq
  const MAX_QUESTION_CHARS = 78
  const truncatedQuestion =
    question.length > MAX_QUESTION_CHARS
      ? question.slice(0, MAX_QUESTION_CHARS) + '...'
      : question
  const hideAvatar = creatorAvatarUrl ? '' : 'hidden'
  const hideAcceptedAvatar = acceptedAvatarUrl ? '' : 'hidden'
  const accepted = acceptedName !== ''
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
     

      <div class="flex flex-col justify-between gap-16 pt-2">
        <div class="flex flex-col text-indigo-700 mt-4 text-5xl leading-tight text-center">
          ${truncatedQuestion}
        </div>
        <div class="flex flex-row grid grid-cols-3">
        <div class="flex flex-col justify-center items-center ${
          creatorOutcome === 'YES' ? 'text-primary' : 'text-red-500'
        }">
        
<!--      Creator user column-->
          <div class="flex flex-col align-bottom gap-6 items-center justify-center">
            <p class="text-gray-900 text-4xl">${creatorName}</p>
            <img
              class="h-36 w-36 rounded-full bg-white flex items-center justify-center ${hideAvatar}"
              src="${creatorAvatarUrl}"
              alt=""
            />
        </div>
        <div class="flex flex-row justify-center items-center gap-3 mt-6"> 
          <div class="text-5xl">${'M$' + creatorAmount}</div>
          <div class="text-4xl">${'on'}</div>
          <div class="text-5xl ">${creatorOutcome}</div>
        </div>
      </div>
      
<!--      VS-->
        <div class="flex flex-col text-gray-900 text-6xl mt-8 text-center">
        VS
        </div>
      <div class="flex flex-col justify-center items-center ${
        challengerOutcome === 'YES' ? 'text-primary' : 'text-red-500'
      }">

<!--     Unaccepted user column-->
          <div class="flex flex-col align-bottom gap-6 items-center justify-center
              ${accepted ? 'hidden' : ''}">
            <p class="text-gray-900 text-4xl">You</p>
            <img
              class="h-36 w-36 rounded-full bg-white flex items-center justify-center "
              src="https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png"
              alt=""
            />
        </div>
<!--    Accepted user column-->
          <div class="flex flex-col align-bottom gap-6 items-center justify-center">
            <p class="text-gray-900 text-4xl">${acceptedName}</p>
            <img
              class="h-36 w-36 rounded-full bg-white flex items-center justify-center ${hideAcceptedAvatar}"
              src="${acceptedAvatarUrl}"
              alt=""
            />
        </div>  
        <div class="flex flex-row justify-center items-center gap-3 mt-6"> 
          <div class="text-5xl">${'M$' + challengerAmount}</div>
          <div class="text-4xl">${'on'}</div>
          <div class="text-5xl ">${challengerOutcome}</div>
          </div>
      </div>
      </div>
        
        </div>
      </div>
    <!-- Manifold logo -->
    <div class="flex flex-row justify-center mt-20 ">
      <a class="flex flex-row gap-3" href="/">
      <img
        class="sm:h-12 sm:w-12"
        src="https:&#x2F;&#x2F;manifold.markets&#x2F;logo.png"
        width="40"
        height="40"
        alt=''
      />
      <div
        class="hidden sm:flex font-major-mono lowercase mt-1 sm:text-3xl md:whitespace-nowrap"
        >
        Manifold Markets
      </div></a>
    </div>
     
    </div>
  </body>
</html>`
}
