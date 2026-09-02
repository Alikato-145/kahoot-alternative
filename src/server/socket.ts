import type { Server, Socket } from 'socket.io'
import { GameService, type GameServiceEvent } from './game/service'

const roomFor = (sessionId: string) => `game:${sessionId}`

function payload(event: GameServiceEvent): Omit<GameServiceEvent, 'sessionId' | 'type'> {
  const { sessionId: _, type: __, ...rest } = event
  return rest
}

function emitError(socket: Socket, error: unknown): void {
  socket.emit('game:error', { message: error instanceof Error ? error.message : 'Game request failed' })
}

export function registerGameSocketHandlers(io: Server, service = new GameService()): GameService {
  service.subscribe((event) => io.to(roomFor(event.sessionId)).emit(event.type, payload(event)))
  io.on('connection', (socket) => {
    socket.on('player:join', async ({ pin, nickname, playerId }: { pin: string; nickname: string; playerId?: string }) => {
      try {
        const joined = await service.joinPlayer(pin, nickname, playerId)
        socket.join(roomFor(joined.sessionId))
        socket.emit('room:joined', { sessionId: joined.sessionId, player: joined.player })
        socket.emit('game:state', joined.snapshot)
        io.to(roomFor(joined.sessionId)).emit('lobby:players', joined.snapshot.players)
      } catch (error) { emitError(socket, error) }
    })

    socket.on('player:answer', async (input) => {
      try {
        const result = await service.submitPlayerAnswer(input)
        if (result.accepted) socket.emit('answer:accepted', result)
        else socket.emit('game:error', { message: 'Answer was not accepted' })
      } catch (error) { emitError(socket, error) }
    })

    const host = (method: 'startGame' | 'revealQuestion' | 'nextQuestion') => async ({ sessionId }: { sessionId: string }) => {
      try {
        socket.join(roomFor(sessionId))
        await service[method](sessionId)
      } catch (error) { emitError(socket, error) }
    }
    socket.on('host:start', host('startGame'))
    socket.on('host:reveal', host('revealQuestion'))
    socket.on('host:next', host('nextQuestion'))
  })
  return service
}
