import * as fs from 'fs'
import * as path from 'path'

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

const manicode = async (userPrompt: string) => {
  // First prompt to Claude: Ask which files to read
  const fileSelectionPrompt = `
    The user has a coding assignment for you.

    Can you answer the below prompt with:
    1. A description of what the user wants done.
    2. Your best summary of what strategy you will employ to implement it in code (keep it simple!).
    3. A list of which files (up to 20) would be most relevant to read or write to for providing an accurate response. Please list only the file paths, one per line. You will later respond in a second prompt with edits to make to these files (or what new files to create), so choose the files wisely.

    User's request: ${userPrompt}
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
  const filesToRead = fileSelectionResponse.trim().split('\n')

  // Read the content of selected files
  const fileContents = filterDefined(
    filesToRead.map((file) => {
      const filePath = path.join(__dirname, '..', '..', file)
      try {
        return `File: ${file}\n\n${fs.readFileSync(filePath, 'utf8')}`
      } catch (error) {
        return undefined
      }
    })
  ).join('\n\n')

  // Second prompt to Claude: Answer the user's question
  const finalPrompt = `
    The user has a coding question for you.

    Can you answer the below prompt with:
    1. A description of what the user wants done.
    2. Your best summary of what strategy you will employ to implement it in code (keep it simple!).
    3. Please end your message with a list of files and their entire contents that you want changed. You can create new files or modify existing files. You must provide the full contents of the files you want changed, because we are replacing the files with your response. Do not write anything like the props are unchanged or the helper fuctions are unchanged.
    For the files, please put one line for the filepath and then put the contents.

    Here is an example response:
    <example>
    1. The user wants [...insert answer]
    2. We should [... insert answer]
    3. Files to modify:

    File: web/pages/live-activity.tsx

    console.log('Hello world 1!')
    console.log('Hello world 2!')

    File: web/pages/home.tsx

    console.log('Hello home!')
    </example>

    Ok, here are the contents of some relevant files:

    ${fileContents}


    User: ${userPrompt}
    `

  const finalResponse = await promptClaudeWithProgress(finalPrompt, { system })

  console.log(finalResponse)

  // Parse the response and write files
  const fileRegex = /File: (.+?)\n([\s\S]+?)(?=\n\nFile:|$)/g
  let match

  while ((match = fileRegex.exec(finalResponse)) !== null) {
    const [, filePath, fileContent] = match
    const fullPath = path.join(__dirname, '..', '..', filePath.trim())

    try {
      // Ensure the directory exists
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })

      // Write the file content, creating the file if it doesn't exist
      fs.writeFileSync(fullPath, fileContent.trim(), { flag: 'w' })
      console.log(`Successfully wrote to ${filePath}`)
    } catch (error) {
      console.error(`Error writing to ${filePath}:`, error)
    }
  }
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
