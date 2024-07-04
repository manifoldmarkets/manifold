import { runScript } from 'run-script'
import { promptClaude } from 'shared/helpers/claude'
import * as fs from 'fs'
import * as path from 'path'

if (require.main === module)
  runScript(async ({ pg }) => {
    // Read the content of code-guide.md
    const codeGuidePath = path.join(__dirname, '..', '..', 'code-guide.md')
    const system = fs.readFileSync(codeGuidePath, 'utf8')

    const prompt = 'How would you characterize our coding style?'
    const response = await promptClaude(prompt, { system })

    console.log(response)
  })
