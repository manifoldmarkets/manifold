import { ParsedRequest } from './types'
import { getTemplateCss } from './template-css'

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
    numericValue,
    resolution,
  } = parsedReq
  const hideAvatar = creatorAvatarUrl ? '' : 'hidden'

  let resolutionColor = 'text-primary'
  let resolutionString = 'YES'
  switch (resolution) {
    case 'YES':
      break
    case 'NO':
      resolutionColor = 'text-red-500'
      resolutionString = 'NO'
      break
    case 'CANCEL':
      resolutionColor = 'text-yellow-500'
      resolutionString = 'N/A'
      break
    case 'MKT':
      resolutionColor = 'text-blue-500'
      resolutionString = numericValue ? numericValue : probability
      break
  }

  const resolutionDiv = `
        <span class='text-center ${resolutionColor}'>
          <div class="text-8xl">
              ${resolutionString}
            </div>
          <div class="text-4xl">${
            resolution === 'CANCEL' ? '' : 'resolved'
          }</div>
        </span>`

  const probabilityDiv = `
        <span class='text-primary text-center'>
          <div class="text-8xl">${probability}</div>
          <div class="text-4xl">chance</div>
        </span>`

  const numericValueDiv = `
        <span class='text-blue-500 text-center'> 
           <div class="text-8xl ">${numericValue}</div>
          <div class="text-4xl">expected</div>
        </span>
      `

  return `<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <title>Generated Image</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://cdn.tailwindcss.com?plugins=line-clamp"></script>
    </head>
    <style>
        ${getTemplateCss(theme, fontSize)}
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

      <!-- Manifold logo -->
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
        <div class="text-indigo-700 text-6xl leading-tight line-clamp-4">
          ${question}
        </div>
        <div class="flex flex-col">
                    ${
                      resolution
                        ? resolutionDiv
                        : numericValue
                        ? numericValueDiv
                        : probability
                        ? probabilityDiv
                        : ''
                    }
        </div>
      </div>

      <!-- Metadata -->
      <div class="absolute bottom-16">
        <div class="text-gray-500 text-3xl max-w-[80vw] line-clamp-2">
          ${metadata}
        </div>
      </div>
    </div>
  </body>
</html>`
}
