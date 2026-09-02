import { gameKeys, getRedis } from '../redis'
import { closeQuestion, expireSession, getSnapshot, joinSession, setGameState, submitAnswer } from './store'
import type { GameSnapshot, LivePlayer, SubmitAnswerInput, SubmitAnswerResult } from './types'

export type GameServiceEvent =
  | { type: 'question:intro'; sessionId: string; questionId: string; questionIndex: number; body: string; questionImageUrl: string | null }
  | { type: 'question:open'; sessionId: string; questionId: string; deadlineAt: number }
  | { type: 'question:reveal'; sessionId: string; questionId: string; correctChoiceId: string; choiceCounts: Record<string, number>; revealImageUrl: string | null; explanation: string | null }
  | { type: 'score:rank-update'; sessionId: string; playerId: string; earnedScore: number; totalScore: number; previousRank: number; rank: number }
  | { type: 'leaderboard:update'; sessionId: string; players: LivePlayer[] }
  | { type: 'game:final-results'; sessionId: string; players: LivePlayer[] }

export type GameServiceOptions = { introDurationMs?: number; answerDurationMs?: number }
type Listener = (event: GameServiceEvent) => void

const INTRO_DURATION_MS = 5_000
const ANSWER_DURATION_MS = 20_000

function requireSnapshot(snapshot: GameSnapshot | null, sessionId: string): GameSnapshot {
  if (!snapshot) throw new Error(`Game session not found: ${sessionId}`)
  return snapshot
}

function questionFrom(snapshot: GameSnapshot) {
  const index = snapshot.state.currentQuestionIndex
  if (index === null || !snapshot.quiz.questions[index]) throw new Error('The game has no current question')
  return snapshot.quiz.questions[index]
}

export class GameService {
  private readonly introDurationMs: number
  private readonly answerDurationMs: number
  private readonly listeners = new Set<Listener>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly previousRanks = new Map<string, Map<string, number>>()

  constructor(options: GameServiceOptions = {}) {
    this.introDurationMs = options.introDurationMs ?? INTRO_DURATION_MS
    this.answerDurationMs = options.answerDurationMs ?? ANSWER_DURATION_MS
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async getSnapshot(sessionId: string): Promise<GameSnapshot | null> { return getSnapshot(sessionId) }

  async sessionIdForPin(pin: string): Promise<string | null> { return getRedis().get(gameKeys.pin(pin)) }

  async joinPlayer(pin: string, nickname: string, playerId?: string): Promise<{ sessionId: string; player: LivePlayer; snapshot: GameSnapshot }> {
    const sessionId = await this.sessionIdForPin(pin)
    if (!sessionId) throw new Error('Game PIN is invalid or expired')
    const current = requireSnapshot(await getSnapshot(sessionId), sessionId)
    const reconnectingPlayer = playerId ? current.players.find((player) => player.id === playerId) : undefined
    if (reconnectingPlayer) return { sessionId, player: reconnectingPlayer, snapshot: current }
    const player = await joinSession(pin, nickname, playerId)
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    return { sessionId, player, snapshot }
  }

  async submitPlayerAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> { return submitAnswer(input) }

  async startGame(sessionId: string): Promise<GameServiceEvent> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    if (snapshot.state.phase !== 'lobby') throw new Error('Game can only start from the lobby')
    if (!snapshot.quiz.questions.length) throw new Error('Game needs at least one question')
    await setGameState(sessionId, { phase: 'question-intro', currentQuestionIndex: 0, openedAt: null, deadlineAt: null })
    return this.publishIntro(sessionId)
  }

  async openQuestion(sessionId: string): Promise<GameServiceEvent> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    if (snapshot.state.phase !== 'question-intro') throw new Error('Question can only open after its introduction')
    const question = questionFrom(snapshot)
    const openedAt = Date.now()
    const deadlineAt = openedAt + this.answerDurationMs
    this.previousRanks.set(sessionId, new Map(snapshot.players.map((player, index) => [player.id, index + 1])))
    await setGameState(sessionId, { phase: 'answering', openedAt, deadlineAt })
    const event: GameServiceEvent = { type: 'question:open', sessionId, questionId: question.id, deadlineAt }
    this.publish(event)
    this.schedule(sessionId, this.answerDurationMs, () => this.revealQuestion(sessionId))
    return event
  }

  async revealQuestion(sessionId: string): Promise<{ events: GameServiceEvent[] }> {
    const beforeClose = requireSnapshot(await getSnapshot(sessionId), sessionId)
    if (beforeClose.state.phase !== 'answering') throw new Error('Question can only be revealed while accepting answers')
    const question = questionFrom(beforeClose)
    const snapshot = requireSnapshot(await closeQuestion(sessionId), sessionId)
    const answers = snapshot.answers[question.id]
    const correctChoice = question.choices.find((choice) => choice.isCorrect)
    if (!correctChoice) throw new Error(`Question ${question.id} has no correct choice`)
    const reveal: GameServiceEvent = {
      type: 'question:reveal', sessionId, questionId: question.id, correctChoiceId: correctChoice.id,
      choiceCounts: answers?.choiceCounts ?? {}, revealImageUrl: question.revealImageUrl, explanation: question.explanation,
    }
    this.publish(reveal)
    const previousRanks = this.previousRanks.get(sessionId) ?? new Map(snapshot.players.map((player, index) => [player.id, index + 1]))
    const rankEvents: GameServiceEvent[] = snapshot.players.map((player, index) => ({
      type: 'score:rank-update', sessionId, playerId: player.id,
      earnedScore: answers?.playerAnswers[player.id]?.earnedScore ?? 0,
      totalScore: player.score, previousRank: previousRanks.get(player.id) ?? index + 1, rank: index + 1,
    }))
    for (const event of rankEvents) this.publish(event)
    await setGameState(sessionId, { phase: 'score-rank', openedAt: null, deadlineAt: null })
    const leaderboard: GameServiceEvent = { type: 'leaderboard:update', sessionId, players: snapshot.players }
    this.publish(leaderboard)
    return { events: [reveal, ...rankEvents, leaderboard] }
  }

  async nextQuestion(sessionId: string): Promise<GameServiceEvent> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    if (snapshot.state.phase !== 'score-rank') throw new Error('The host can only advance after rankings are shown')
    const nextIndex = (snapshot.state.currentQuestionIndex ?? -1) + 1
    if (nextIndex >= snapshot.quiz.questions.length) {
      await setGameState(sessionId, { phase: 'final-results', openedAt: null, deadlineAt: null })
      await expireSession(sessionId)
      const event: GameServiceEvent = { type: 'game:final-results', sessionId, players: snapshot.players }
      this.publish(event)
      return event
    }
    await setGameState(sessionId, { phase: 'question-intro', currentQuestionIndex: nextIndex, openedAt: null, deadlineAt: null })
    return this.publishIntro(sessionId)
  }

  private async publishIntro(sessionId: string): Promise<GameServiceEvent> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    const question = questionFrom(snapshot)
    const event: GameServiceEvent = { type: 'question:intro', sessionId, questionId: question.id, questionIndex: question.position, body: question.body, questionImageUrl: question.questionImageUrl }
    this.publish(event)
    this.schedule(sessionId, this.introDurationMs, () => this.openQuestion(sessionId))
    return event
  }

  private publish(event: GameServiceEvent): void { for (const listener of Array.from(this.listeners)) listener(event) }

  private schedule(sessionId: string, delayMs: number, callback: () => Promise<unknown>): void {
    const existing = this.timers.get(sessionId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => { this.timers.delete(sessionId); void callback().catch(() => undefined) }, delayMs)
    timer.unref?.()
    this.timers.set(sessionId, timer)
  }
}
