let fetchRequest: typeof fetch

try {
  fetchRequest = fetch
} catch {
  fetchRequest = require('node-fetch')
}

export default fetchRequest
