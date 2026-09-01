import { randomUUID } from 'node:crypto'
import type { Quiz } from '../repositories/quizzes'
import { ACTIVE_SESSION_TTL_SECONDS, FINAL_SESSION_TTL_SECONDS, gameKeys, getRedis } from '../redis'
import { scoreAnswer } from './scoring'
import type { AnswerRecord, GamePhase, GameSnapshot, GameState, LivePlayer, QuestionAnswers, Session, SubmitAnswerInput, SubmitAnswerResult } from './types'

type StoredPlayer = { id: string; nickname: string }

function parseJson<T>(value: string | null): T | null {
  return value ? JSON.parse(value) as T : null
}

async function sessionKeys(sessionId: string): Promise<string[]> {
  const redis = getRedis()
  let cursor = '0'
  const keys: string[] = []
  do {
    const [nextCursor, found] = await redis.scan(cursor, 'MATCH', gameKeys.sessionPattern(sessionId), 'COUNT', 100)
    cursor = nextCursor
    keys.push(...found)
  } while (cursor !== '0')
  return keys
}

async function touchSession(sessionId: string, ttlSeconds = ACTIVE_SESSION_TTL_SECONDS): Promise<void> {
  const redis = getRedis()
  const state = parseJson<GameState>(await redis.get(gameKeys.state(sessionId)))
  const keys = await sessionKeys(sessionId)
  if (state) keys.push(gameKeys.pin(state.pin))
  if (!keys.length) return
  const pipeline = redis.pipeline()
  for (const key of keys) pipeline.expire(key, ttlSeconds)
  await pipeline.exec()
}

export async function createSession(quiz: Quiz, pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')): Promise<Session> {
  const id = randomUUID()
  const state: GameState = { sessionId: id, quizId: quiz.id, pin, phase: 'lobby', currentQuestionIndex: null, openedAt: null, deadlineAt: null }
  const redis = getRedis()
  await redis.multi()
    .set(gameKeys.pin(pin), id, 'EX', ACTIVE_SESSION_TTL_SECONDS)
    .set(gameKeys.state(id), JSON.stringify(state), 'EX', ACTIVE_SESSION_TTL_SECONDS)
    .set(gameKeys.quiz(id), JSON.stringify(quiz), 'EX', ACTIVE_SESSION_TTL_SECONDS)
    .exec()
  return { id, pin }
}

export async function joinSession(pin: string, nickname: string, playerId = randomUUID()): Promise<LivePlayer> {
  const redis = getRedis()
  const sessionId = await redis.get(gameKeys.pin(pin))
  if (!sessionId) throw new Error('Game PIN is invalid or expired')
  const state = parseJson<GameState>(await redis.get(gameKeys.state(sessionId)))
  if (!state || state.phase !== 'lobby') throw new Error('Game has already started')
  const player: StoredPlayer = { id: playerId, nickname }
  await redis.multi()
    .hset(gameKeys.players(sessionId), playerId, JSON.stringify(player))
    .zadd(gameKeys.leaderboard(sessionId), 0, playerId)
    .exec()
  await touchSession(sessionId)
  return { ...player, score: 0 }
}

export async function setGameState(sessionId: string, patch: Partial<Pick<GameState, 'phase' | 'currentQuestionIndex' | 'openedAt' | 'deadlineAt'>>): Promise<GameState> {
  const redis = getRedis()
  const existing = parseJson<GameState>(await redis.get(gameKeys.state(sessionId)))
  if (!existing) throw new Error(`Game session not found: ${sessionId}`)
  const state = { ...existing, ...patch }
  await redis.set(gameKeys.state(sessionId), JSON.stringify(state))
  await touchSession(sessionId)
  return state
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
  const redis = getRedis()
  const sessionId = await redis.get(gameKeys.pin(input.pin))
  if (!sessionId) throw new Error('Game PIN is invalid or expired')
  const [stateValue, quizValue, playerValue] = await Promise.all([
    redis.get(gameKeys.state(sessionId)),
    redis.get(gameKeys.quiz(sessionId)),
    redis.hget(gameKeys.players(sessionId), input.playerId),
  ])
  const state = parseJson<GameState>(stateValue)
  const quiz = parseJson<Quiz>(quizValue)
  const player = playerValue ? parseJson<StoredPlayer>(playerValue) : null
  if (!state || !quiz || !player || state.phase !== 'answering') return { accepted: false }
  const question = quiz.questions[state.currentQuestionIndex ?? -1]
  const choice = question?.choices.find((item) => item.id === input.choiceId)
  if (!question || question.id !== input.questionId || !choice || !state.deadlineAt || Date.now() > state.deadlineAt) return { accepted: false }

  const now = Date.now()
  const openedAt = state.openedAt ?? now
  const deadlineMs = Math.max(1, state.deadlineAt - openedAt)
  const elapsedMs = Math.max(0, now - openedAt)
  const earnedScore = scoreAnswer(choice.isCorrect, elapsedMs, deadlineMs)
  const answerKey = gameKeys.answers(sessionId, input.questionId)
  const answer: AnswerRecord = { choiceId: input.choiceId, earnedScore, elapsedMs, answeredAt: now }

  for (;;) {
    await redis.watch(answerKey)
    if (await redis.hexists(answerKey, input.playerId)) {
      await redis.unwatch()
      return { accepted: false }
    }
    const result = await redis.multi()
      .hset(answerKey, input.playerId, JSON.stringify(answer))
      .hincrby(answerKey, `count:${input.choiceId}`, 1)
      .zincrby(gameKeys.leaderboard(sessionId), earnedScore, input.playerId)
      .expire(answerKey, ACTIVE_SESSION_TTL_SECONDS)
      .exec()
    if (result) break
  }
  await touchSession(sessionId)
  return { accepted: true, earnedScore }
}

export async function closeQuestion(sessionId: string): Promise<GameSnapshot | null> {
  await setGameState(sessionId, { phase: 'reveal', deadlineAt: null })
  return getSnapshot(sessionId)
}

export async function getSnapshot(sessionId: string): Promise<GameSnapshot | null> {
  const redis = getRedis()
  const [stateValue, quizValue, playerHash] = await Promise.all([
    redis.get(gameKeys.state(sessionId)), redis.get(gameKeys.quiz(sessionId)), redis.hgetall(gameKeys.players(sessionId)),
  ])
  const state = parseJson<GameState>(stateValue)
  const quiz = parseJson<Quiz>(quizValue)
  if (!state || !quiz) return null
  const players: LivePlayer[] = await Promise.all(Object.values(playerHash).map(async (value) => {
    const player = parseJson<StoredPlayer>(value)!
    return { ...player, score: Number(await redis.zscore(gameKeys.leaderboard(sessionId), player.id) ?? 0) }
  }))
  players.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
  const answers: Record<string, QuestionAnswers> = {}
  for (const question of quiz.questions) {
    const values = await redis.hgetall(gameKeys.answers(sessionId, question.id))
    const playerAnswers: Record<string, AnswerRecord> = {}
    const choiceCounts: Record<string, number> = Object.fromEntries(question.choices.map((choice) => [choice.id, Number(values[`count:${choice.id}`] ?? 0)]))
    for (const [field, value] of Object.entries(values)) if (!field.startsWith('count:')) playerAnswers[field] = JSON.parse(value) as AnswerRecord
    answers[question.id] = { playerAnswers, choiceCounts }
  }
  return { state, quiz, players, answers }
}

export async function expireSession(sessionId: string): Promise<void> {
  await touchSession(sessionId, FINAL_SESSION_TTL_SECONDS)
}

export type { GamePhase }
