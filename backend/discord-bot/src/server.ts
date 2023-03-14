import * as http from 'http'
import * as process from 'process'

const hostname = '0.0.0.0'
const port = process.env.PORT ?? '8080'
const server = http.createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end(
    `Hello! This server is just to let the GCP Cloud Run service know we're ready, and we don't need it if we move off Cloud Run`
  )
})

export const startServerForGCP = () =>
  server.listen(parseInt(port), hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`)
  })
