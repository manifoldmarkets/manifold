import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

import { runScript } from 'run-script'
import { models, promptClaude } from 'shared/helpers/claude'
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
  3. Please end your message with a list of files and the specific edits you want to make.
   For creating new files or editing existing files, provide the file contents wrapped in XML tags with the file path as an attribute, like this:
   <file path="web/components/example.tsx">
   // File contents here
   </file>

  You can make multiple changes to a file by making clear which parts of the file stay the same and which should be edited. Feel free to use code comments to say something like "// The rest of the file is unchanged".

  Here is an example response:
  <example>
  1. The user wants [...insert answer]
  2. We should [... insert answer]
  3. Files to modify:

  <file path="web/components/new-component.tsx">
  export const NewComponent = () => 'Hello world!'
  </file>

  <file path="web/components/example.tsx">
  import React from 'react';

  const ExampleComponent = () => {
    console.log('New line 1');
    console.log('New line 2');
    console.log('New line 3');
    return <div>Example</div>;
  };

  export default ExampleComponent;
  </file>

  <file path="web/pages/live-activity.tsx">
  // Other imports stay the same.
  import { uniq } from 'lodash'

  console.log(uniq(['a']))
  </file>
  </example>

  Ok, here are the contents of some relevant files:

  ${fileContents}


  User: ${firstPrompt}
  `

  const secondResponse = await promptClaudeWithProgress(secondPrompt, {
    system,
  })

  console.log(secondResponse)
  await applyEdits(secondResponse)

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

            await applyEdits(claudeResponse)

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

async function applyEdits(instructions: string) {
  // Ask Claude Haiku which files are being edited or created
  const fileListPrompt = `
Given the following instructions, list the full file paths of all files being edited or created, one per line. Include both new files and existing files that are being modified.

Example input:

<file path="web/components/new-component.tsx">
export const NewComponent = () => 'Hello world!'
</file>

<file path="web/components/example.tsx">
console.log('New line 1');

console.log('New line 2');
console.log('New line 3');
</file>

Example output:
web/components/new-component.tsx
web/components/example.tsx

Instructions:
${instructions}

File paths:
`

  const fileListResponse = await promptClaude(fileListPrompt, {
    model: models.sonnet,
  })
  const filesToEdit = fileListResponse.trim().split('\n')
  console.log('haiku fileListResponse', fileListResponse)

  await Promise.all(
    filesToEdit.map(async (filePath) => {
      if (!filePath || !filePath.includes('/')) return

      const fullPath = path.join(__dirname, '..', '..', filePath.trim())
      let originalContent = ''

      try {
        const stats = fs.statSync(fullPath)
        if (stats.isFile()) {
          originalContent = fs.readFileSync(fullPath, 'utf8')
        } else if (stats.isDirectory()) {
          console.log(`Skipping directory: ${filePath}`)
          return
        }
      } catch (error) {
        // File doesn't exist, which is fine for new files
      }

      const editPrompt = `
Given the following original file content and edit instructions, provide the complete updated content for the specified file. Please output the updated contents in a file tag with that path:
<file path="${filePath}">
// updated contents
</file>

Original:
<file path="${filePath}">
${originalContent}
</file>

Edit instructions:
${instructions}

Updated file content:
`

      const updatedContent = await promptClaude(editPrompt, {
        model: models.sonnet,
      })

      try {
        const match = updatedContent.match(
          /<file\s+path=["']([^"']+)["']>\s*([\s\S]*?)\s*<\/file>/i
        )
        if (match) {
          const [, matchedPath, fileContent] = match
          if (matchedPath.trim() === filePath.trim()) {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true })
            fs.writeFileSync(fullPath, fileContent.trim(), 'utf8')
            console.log(`Successfully updated ${filePath}`)
          } else {
            console.error(
              `Error: File path mismatch. Expected ${filePath}, got ${matchedPath}`
            )
          }
        } else {
          console.error(
            `Error: Could not parse updated content for ${filePath}`
          )
          console.log('Received content:', updatedContent)
        }
      } catch (error) {
        console.error(`Error updating ${filePath}:`, error)
      }
    })
  )
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
