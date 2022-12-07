import Koa from 'koa'
import websocket from 'koa-easy-ws'
import { Server } from '@hocuspocus/server'
import { Logger } from '@hocuspocus/extension-logger'

// Configure hocuspocus
const server = Server.configure({
  // …
})

const app = new Koa()

// Setup your koa instance using the koa-easy-ws extension
app.use(websocket())

// Add a websocket route for hocuspocus
// Note: make sure to include a parameter for the document name.
// You can set any contextual data like in the onConnect hook
// and pass it to the handleConnection method.
app.use(async (ctx, next) => {
  console.log('New request', ctx.request.path)
  const ws = await ctx.ws()
  const documentName = ctx.request.path.substring(1)

  console.log('New connection', documentName)

  server.handleConnection(
    ws,
    ctx.request,
    documentName,
    // additional data (optional)
    {
      user_id: 1234,
    }
  )
})

// Start the server
app.listen(1234)
console.log('started server on', 1234)
