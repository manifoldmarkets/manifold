import { runScript } from './run-script'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { getContractFromSlug } from 'common/supabase/contracts'

runScript(async () => {
  const adminDb = await initSupabaseAdmin()
  const contract = await getContractFromSlug(adminDb, 'mexico-vs-south-africa-group-a-worl')
  if (!contract || !('answers' in contract)) {
    console.log('No contract or answers found')
    return
  }
  contract.answers.forEach((a: any) => {
    const codePoints = [...a.text].map((c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4,'0')}`).join(' ')
    console.log(`answer.text: "${a.text}" | bytes: ${codePoints}`)
  })
})
