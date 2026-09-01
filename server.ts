import 'dotenv/config'
import http from 'node:http'
import next from 'next'
import { loadConfig } from './src/server/config'

const config = loadConfig()
const app = next({ dev: process.env.NODE_ENV !== 'production' })
const handle = app.getRequestHandler()

async function start() {
  await app.prepare()
  http.createServer((request, response) => handle(request, response)).listen(config.port, () => {
    console.log(`Camp Quiz listening on ${config.port}`)
  })
}

void start()
