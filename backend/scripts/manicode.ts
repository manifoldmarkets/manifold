import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { execSync } from 'child_process'

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
The user has a coding question for you.

Can you answer the below prompt with:
1. A description of what the user wants done.
2. Your best summary of what strategy you will employ to implement it in code (keep it simple!).
3. Please list the files and the specific edits you want to make.
  For creating new files or editing existing files, provide the file contents wrapped in XML tags with the file path as an attribute, like this:
  <file path="web/components/example.tsx">
  // File contents here
  </file>
For existing files, when making changes, use the following format to specify line replacements:
  <replace>
  old_line_1
  old_line_2
  ...
  </replace>
  <with>
  new_line_1
  new_line_2
  ...
  </with>
You can include multiple replace-with blocks in a single file if needed. To delete lines, use an empty <with></with> block.
4. Please create one Node.js script that loads the files listed in step 3, applies the edits described, and saves the changes. The script should use the line replacement strategy described above.
Wrap the script in <script> tags. Additionally, note that there is a base path you need to prepend to the file path to access the file. The base path is "${path.join(
    __dirname,
    '..',
    '..'
  )}".

Here is an example response:
<example>
1. The user wants to add a new import and console log statement to the app.ts file, and create a new component file.
2. We should modify the app.ts file to add the new import and console log, and create a new file for the component.
3. Files to modify:

<file path="backend/api/src/app.ts">
<replace>
import * as express from 'express'
import { ErrorRequestHandler, RequestHandler } from 'express'
</replace>
<with>
import * as express from 'express'
import { ErrorRequestHandler, RequestHandler } from 'express'
import { uniq } from 'lodash'
</with>

<replace>
if (a === b) {
  // Existing code
}
</replace>
<with>
if (a === b) {
  console.log(uniq(['a']))
  // Existing code
}
</with>
</file>

<file path="web/components/new-component.tsx">
export const NewComponent = () => 'Hello world!'
</file>

4. Here's a Node.js script to apply these changes:
<script>
const fs = require('fs')
const path = require('path')

const basePath = '${path.join(__dirname, '..', '..')}'

function applyChanges(filePath, changes) {
  let content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')

  changes.forEach(({ replace, with: replacement }) => {
    const replaceLines = replace.split('\n')
    const withLines = replacement.split('\n')

    for (let i = 0; i <= lines.length - replaceLines.length; i++) {
      if (lines.slice(i, i + replaceLines.length).join('\n') === replaceLines.join('\n')) {
        lines.splice(i, replaceLines.length, ...withLines)
        break
      }
    }
  })

  fs.writeFileSync(filePath, lines.join('\n'))
}

// Update app.ts
const appPath = path.join(basePath, 'backend/api/src/app.ts')
const appChanges = [
  {
    replace: \`import * as express from 'express'
import { ErrorRequestHandler, RequestHandler } from 'express'\`,
    with: \`import * as express from 'express'
import { ErrorRequestHandler, RequestHandler } from 'express'
import { uniq } from 'lodash'\`
  },
  {
    replace: \`if (a === b) {
  // Existing code
}\`,
    with: \`if (a === b) {
  console.log(uniq(['a']))
  // Existing code
}\`
  }
]
applyChanges(appPath, appChanges)
console.log('Changes applied successfully to app.ts')

// Create new-component.tsx
const newComponentPath = path.join(basePath, 'web/components/new-component.tsx')
const newComponentContent = \`export const NewComponent = () => 'Hello world!'\`
fs.writeFileSync(newComponentPath, newComponentContent)
console.log('Created new-component.tsx successfully')
</script>
</example>

Ok, here are the contents of some relevant files:

${fileContents}


User: ${firstPrompt}
`

  const secondResponse = await promptClaudeWithProgress(secondPrompt, {
    system,
  })

  console.log(secondResponse)

  // Extract the script from the response
  const scriptMatch = secondResponse.match(/<script>([\s\S]*?)<\/script>/)
  if (scriptMatch) {
    const script = scriptMatch[1]
    // Save the script to a temporary file
    const tempScriptPath = path.join(__dirname, 'temp-edit-script.js')
    fs.writeFileSync(tempScriptPath, script)

    // Execute the script
    try {
      execSync(`node "${tempScriptPath}"`, { stdio: 'inherit' })
      console.log('Successfully applied edits')
    } catch (error) {
      console.error('Error executing edit script:', error)
    } finally {
      // Clean up the temporary script file
      fs.unlinkSync(tempScriptPath)
    }
  } else {
    console.error('No script found in the response')
  }

  interface ConversationEntry {
    role: 'user' | 'assistant'
    content: string
  }

  const conversationHistory: ConversationEntry[] = [
    { role: 'user', content: firstPrompt },
    { role: 'assistant', content: fileSelectionResponse },
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

          const fullPrompt = conversationHistory
            .map(({ role, content }) => {
              const label =
                role === 'user' ? 'The user said:' : 'The assistant said:'
              return `${label}\n\n${content}`
            })
            .join('\n\n')

          try {
            const claudeResponse = await promptClaudeWithProgress(fullPrompt, {
              system,
            })
            console.log('Claude:', claudeResponse)

            conversationHistory.push({
              role: 'assistant',
              content: claudeResponse,
            })

            // Extract and execute the script from the response
            const scriptMatch = claudeResponse.match(
              /<script>([\s\S]*?)<\/script>/
            )
            if (scriptMatch) {
              const script = scriptMatch[1]
              const tempScriptPath = path.join(__dirname, 'temp-edit-script.js')
              fs.writeFileSync(tempScriptPath, script)

              try {
                execSync(`node "${tempScriptPath}"`, { stdio: 'inherit' })
                console.log('Successfully applied edits')
              } catch (error) {
                console.error('Error executing edit script:', error)
              } finally {
                fs.unlinkSync(tempScriptPath)
              }
            } else {
              console.error('No script found in the response')
            }

            // Continue the loop
            promptUser()
          } catch (error) {
            console.error('Error:', error)
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
    const response = await promptClaude(prompt, options)
    console.log()
    return response
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
  Here's our API schema. Each key-value pair in the below object corresponds to an endpoint.

E.g. 'comment' can be accessed at \`api.manifold.markets/v0/comment\`. If 'visibility' is 'public', then you need the '/v0', otherwise, you should omit the version. However, you probably don't need the url, you can use our library function \`api('comment', props)\`, or \`useAPIGetter('comment', props)\`
  ${apiSchemaFile}`

  return `${manifoldInfo}

  ${codeGuide}

    ${apiGuide}

    Here are all the code files in our project:
    ${codeFiles.join('\n')}`
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
