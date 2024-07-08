import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

import { runScript } from 'run-script'
import { promptClaude } from 'shared/helpers/claude'
import { filterDefined } from 'common/util/array'

if (require.main === module) {
  runScript(async () => {
    const userPrompt = process.argv[2]
    // E.g.:
    // I want to create a new page which shows off what's happening on manifold right now. Can you use our websocket api to get recent bets on markets and illustrate what's happening in a compelling and useful way?
    if (!userPrompt) {
      console.log('Please provide a prompt on what code to change.')
      return
    }

    await manicode(userPrompt)
  })
}

const manicode = async (firstPrompt: string) => {
  // First prompt to Claude: Ask which files to read
  const fileSelectionPrompt = `
    The user has a coding assignment for you.

    Can you answer the below prompt with:
    1. A description of what the user wants done.
    2. Your best summary of what strategy you will employ to implement it in code (keep it simple!).
    3. A list of which files (up to 20) would be most relevant to read or write to for providing an accurate response. Please list only the file paths, one per line. You will later respond in a second prompt with edits to make to these files (or what new files to create), so choose the files wisely.

    User's request: ${firstPrompt}
    `

  const system = getSystemPrompt()

  // Save the system prompt to a file
  // const systemPromptFilePath = path.join(__dirname, 'system-prompt.md')
  // fs.writeFileSync(systemPromptFilePath, system, 'utf8')

  const fileSelectionResponse = await promptClaudeWithProgress(
    fileSelectionPrompt,
    {
      system,
    }
  )

  console.log(fileSelectionResponse)
  const fileContents = loadListedFiles(fileSelectionResponse)

  // Second prompt to Claude: Answer the user's question
  const secondPrompt = `
<user_request>
${firstPrompt}
</user_request>

<instructions>
The user has a coding question for you. Please provide a detailed response following this structure:

1. User Request: Briefly restate what the user wants to accomplish.

2. Implementation Strategy: Outline your approach to implement the requested changes.

3. File Modifications: List all files that need to be modified or created. For each file, provide the following details:

   a) File path
   b) Whether it's a new file or an existing file to be modified
   c) Specific changes to be made, using the format below:

   For new files:
   <file path="path/to/new/file.tsx">
   // Entire file contents here
   </file>

   For existing files:
   <file path="path/to/existing/file.tsx">
   <replace>
   // Existing code to be replaced (include enough context for accurate matching)
   </replace>
   <with>
   // New code to replace the above
   </with>
   // You can include multiple replace-with blocks if needed
   </file>
</instructions>

<important_reminders>
- Always add necessary import statements when introducing new functions, components, or dependencies.
- Use <replace> and <with> blocks to add or modify import statements at the top of relevant files.
- To delete lines, use an empty <with></with> block.
- Ensure that you're providing enough context in the <replace> blocks for accurate matching.
</important_reminders>

<example>
1. User Request: Add a new NewComponent and use it in the Home page.

2. Implementation Strategy:
   - Create a new file for NewComponent
   - Modify the Home page to import and use NewComponent
   - Ensure all necessary imports are added

3. File Modifications:

<file path="web/components/NewComponent.tsx">
import React from 'react'

export const NewComponent: React.FC = () => {
  return <div>This is a new component</div>
}
</file>

<file path="web/pages/Home.tsx">
<replace>
import React from 'react'
import { SomeExistingComponent } from '../components/SomeExistingComponent'

const Home: React.FC = () => {
  return (
    <div>
      <h1>Welcome to the Home page</h1>
      <SomeExistingComponent />
    </div>
  )
}
</replace>
<with>
import React from 'react'
import { SomeExistingComponent } from '../components/SomeExistingComponent'
import { NewComponent } from '../components/NewComponent'

const Home: React.FC = () => {
  return (
    <div>
      <h1>Welcome to the Home page</h1>
      <SomeExistingComponent />
      <NewComponent />
    </div>
  )
}
</with>
</file>
</example>

Now, please provide your response based on the following file contents and user request:`

  const fullPrompt = `${secondPrompt}

${fileContents}

User: ${firstPrompt}
`

  const secondResponse = await promptClaudeWithProgress(fullPrompt, {
    system,
  })

  console.log(secondResponse)

  // Apply the changes using our own function
  applyChanges(secondResponse)

  interface ConversationEntry {
    role: 'user' | 'assistant'
    content: string
  }

  const conversationHistory: ConversationEntry[] = [
    { role: 'user', content: firstPrompt },
    { role: 'assistant', content: secondResponse },
  ]

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  await new Promise<void>((resolve) => {
    function promptUser() {
      rl.question(
        'Enter your prompt (or type "exit" to quit): ',
        async (userInput: string) => {
          if (userInput.trim().toLowerCase() === 'exit') {
            rl.close()
            resolve()
            return
          }

          conversationHistory.push({ role: 'user', content: userInput })

          // Second Claude call: Answer the user's question
          const fullPrompt = conversationHistory
            .map(({ role, content }) => {
              const label =
                role === 'user' ? 'The user said:' : 'The assistant said:'
              return `${label}\n\n${content}`
            })
            .join('\n\n')
          // First Claude call: Ask which files to read
          const fileSelectionPrompt = `
<conversation_history>
${fullPrompt}
</conversation_history>

<instructions>
Based on the conversation above, which files do you need to read to answer the user's question? Please list the file paths, one per line. It's recommended you include all files you have edited so far.
</instructions>
`
          // Get updated system prompt (includes updated list of files)
          const system = getSystemPrompt()

          const filesToReadResponse = await promptClaudeWithProgress(
            fileSelectionPrompt,
            { system }
          )
          console.log(filesToReadResponse)
          const fileContents = loadListedFiles(filesToReadResponse)


          const finalPrompt = `${fullPrompt}\n\nRelevant file contents:\n\n${fileContents}`

          try {
            const claudeResponse = await promptClaudeWithProgress(finalPrompt, {
              system,
            })
            console.log('Claude:', claudeResponse)

            conversationHistory.push({
              role: 'assistant',
              content: claudeResponse,
            })

            // Apply the changes using our own function
            applyChanges(claudeResponse)

            // Continue the loop
          } catch (error) {
            console.error('Error:', error)
          } finally {
            promptUser()
          }
        }
      )
    }

    promptUser()
  })

  console.log('Manicode session ended.')
}

function loadListedFiles(instructions: string) {
  const filesToRead = instructions.trim().split('\n')

  // Read the content of selected files
  return filterDefined(
    filesToRead.map((file) => {
      const filePath = path.join(__dirname, '..', '..', file)
      try {
        return `<file path="${file}">\n\n${fs.readFileSync(
          filePath,
          'utf8'
        )}\n\n</file>`
      } catch (error) {
        return undefined
      }
    })
  ).join('\n\n')
}

async function promptClaudeWithProgress(prompt: string, options: any) {
  process.stdout.write('Thinking')
  const progressInterval = setInterval(() => {
    process.stdout.write('.')
  }, 500)

  try {
    let fullResponse = ''
    let isComplete = false
    const originalPrompt = prompt

    while (!isComplete) {
      const response = await promptClaude(prompt, options)
      fullResponse += response

      if (fullResponse.includes('[END_OF_RESPONSE]')) {
        isComplete = true
        fullResponse = fullResponse.replace('[END_OF_RESPONSE]', '').trim()
      } else {
        console.log('Didnot complete resposne last response', response)
        // If the response is incomplete, ask for continuation
        prompt = `Please continue your previous response. Remember to end with [END_OF_RESPONSE] when you've completed your full answer.

<original_prompt>
${originalPrompt}
</original_prompt>

<previous_incomplete_response>
${fullResponse}
</previous_incomplete_response>

Continue from here:`
      }
    }

    console.log()
    return fullResponse
  } finally {
    clearInterval(progressInterval)
  }
}

function getSystemPrompt() {
  const codeFiles = getOnlyCodeFiles()

  const manifoldInfoPath = path.join(__dirname, '..', '..', 'manifold-info.md')
  const manifoldInfo = fs.readFileSync(manifoldInfoPath, 'utf8')

  const codeGuidePath = path.join(__dirname, '..', '..', 'code-guide.md')
  const codeGuide = fs.readFileSync(codeGuidePath, 'utf8')

  const apiSchemaFile = fs.readFileSync(
    path.join(__dirname, '..', '..', 'common', 'src', 'api', 'schema.ts'),
    'utf8'
  )

  const apiGuide = `
<api_guide>
Here's our API schema. Each key-value pair in the below object corresponds to an endpoint.

E.g. 'comment' can be accessed at \`api.manifold.markets/v0/comment\`. If 'visibility' is 'public', then you need the '/v0', otherwise, you should omit the version. However, you probably don't need the url, you can use our library function \`api('comment', props)\`, or \`useAPIGetter('comment', props)\`
${apiSchemaFile}
</api_guide>
`

  return `
<manifold_info>
${manifoldInfo}
</manifold_info>

<code_guide>
${codeGuide}
</code_guide>

${apiGuide}

<project_files>
Here are all the code files in our project:
${codeFiles.join('\n')}
</project_files>

<important_instruction>
Always end your response with the following marker:
[END_OF_RESPONSE]
If your response is cut off due to length limitations, do not include the marker and wait for a follow-up prompt to continue.
</important_instruction>`
}

// Function to load file names of every file in the project
function loadAllProjectFiles(projectRoot: string): string[] {
  const allFiles: string[] = []

  function getAllFiles(dir: string) {
    try {
      const files = fs.readdirSync(dir)
      files.forEach((file) => {
        const filePath = path.join(dir, file)
        try {
          const stats = fs.statSync(filePath)
          if (stats.isDirectory()) {
            getAllFiles(filePath)
          } else {
            allFiles.push(filePath)
          }
        } catch (error: any) {
          // do nothing
        }
      })
    } catch (error: any) {
      // do nothing
    }
  }

  getAllFiles(projectRoot)
  return allFiles
}

function getOnlyCodeFiles() {
  const projectRoot = path.join(__dirname, '..', '..')
  const codeDirs = ['common', 'backend', 'web']
  const excludedDirs = [
    'node_modules',
    'dist',
    'scripts',
    'twitch-bot',
    'discord-bot',
  ]
  const includedFiles = ['manicode.ts', 'backfill-unique-bettors-day.ts']
  const allProjectFiles = loadAllProjectFiles(projectRoot)
    .filter((file) => codeDirs.some((dir) => file.includes(dir)))
    .filter(
      (file) =>
        !excludedDirs.some((dir) => file.includes('/' + dir + '/')) ||
        includedFiles.some((name) => file.endsWith(name))
    )
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter((file) => !file.endsWith('.d.ts'))
    .map((file) => file.replace(projectRoot + '/', ''))
  return allProjectFiles
}

function applyChanges(response: string) {
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g
  let match

  while ((match = fileRegex.exec(response)) !== null) {
    const [, filePath, fileContent] = match
    const fullPath = path.join(__dirname, '..', '..', filePath)

    if (fileContent.includes('<replace>')) {
      // Edit existing file
      const currentContent = fs.existsSync(fullPath)
        ? fs.readFileSync(fullPath, 'utf8')
        : ''
      const lines = currentContent.split('\n')

      const replaceRegex =
        /<replace>([\s\S]*?)<\/replace>\s*<with>([\s\S]*?)<\/with>/g
      let replaceMatch
      let replacementMade = false

      while ((replaceMatch = replaceRegex.exec(fileContent)) !== null) {
        const [, replaceContent, withContent] = replaceMatch
        const replaceLines = replaceContent.trim().split('\n')
        const withLines = withContent.trim().split('\n')

        let replaced = false
        for (let i = 0; i <= lines.length - replaceLines.length; i++) {
          if (
            lines.slice(i, i + replaceLines.length).join('\n').trim() ===
            replaceLines.join('\n').trim()
          ) {
            lines.splice(i, replaceLines.length, ...withLines)
            replaced = true
            replacementMade = true
            break
          }
        }

        if (!replaced) {
          console.log(`Warning: Could not find match for replacement in file: ${filePath}`)
          console.log('Replacement content:')
          console.log(replaceContent)
        }
      }

      if (replacementMade) {
        fs.writeFileSync(fullPath, lines.join('\n'))
        console.log(`Updated file: ${filePath}`)
      } else {
        console.log(`No changes made to file: ${filePath}`)
      }
    } else {
      // Replace whole file
      fs.writeFileSync(fullPath, fileContent.trim())
      console.log(`Set file: ${filePath}`)
    }
  }
}