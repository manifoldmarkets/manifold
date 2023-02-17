import * as http from 'http'
import * as process from 'process'

const hostname = '0.0.0.0'
const port = process.env.PORT ?? '8080'

const server = http.createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end('Hello World')
})

export const startListener = () =>
  server.listen(parseInt(port), hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`)
  })
