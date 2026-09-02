import 'dotenv/config'
import { createServer } from 'node:http'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { loadConfig } from './src/server/config'
import { registerGameSocketHandlers } from './src/server/socket'

const config = loadConfig()
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })

void app.prepare().then(() => {
  const handle = app.getRequestHandler()
  const server = createServer((request, response) => handle(request, response))
  const io = new SocketIOServer(server, { path: '/socket.io' })
  registerGameSocketHandlers(io)
  server.listen(config.port, () => console.log(`> Ready on ${config.publicBaseUrl}`))
})
