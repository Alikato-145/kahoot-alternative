import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Quiz } from '@/server/repositories/quizzes'
import { closeRedis, getRedis } from '@/server/redis'
import { createSession, expireSession, getSnapshot, joinSession, setGameState, submitAnswer } from '@/server/game/store'

process.env.REDIS_URL ??= 'redis://localhost:6379'

const quiz: Quiz = {
  id: 'quiz-1', title: 'ค่าย', description: '', coverImageUrl: null,
  questions: [{
    id: 'question-1', position: 0, body: 'คำถาม', questionImageUrl: null, revealImageUrl: null, explanation: null,
    choices: [
      { id: 'choice-correct', position: 0, body: 'ถูก', isCorrect: true },
      { id: 'choice-2', position: 1, body: 'สอง', isCorrect: false },
      { id: 'choice-3', position: 2, body: 'สาม', isCorrect: false },
      { id: 'choice-4', position: 3, body: 'สี่', isCorrect: false },
    ],
  }],
}

describe('Redis game store', () => {
  beforeEach(async () => {
    await getRedis().flushdb()
  })

  afterAll(async () => {
    await closeRedis()
  })

  it('keeps one answer and one aggregate count when a player submits twice', async () => {
    const session = await createSession(quiz, '123456')
    const player = await joinSession('123456', 'มานัส')
    await setGameState(session.id, { phase: 'answering', currentQuestionIndex: 0, deadlineAt: Date.now() + 20_000 })

    const first = await submitAnswer({ pin: '123456', playerId: player.id, questionId: 'question-1', choiceId: 'choice-correct' })
    const duplicate = await submitAnswer({ pin: '123456', playerId: player.id, questionId: 'question-1', choiceId: 'choice-2' })
    const snapshot = await getSnapshot(session.id)

    if (!first.accepted) throw new Error('The first answer should be accepted')
    expect(first.accepted).toBe(true)
    expect(first.earnedScore).toBeGreaterThan(0)
    expect(duplicate).toEqual({ accepted: false })
    expect(snapshot?.answers['question-1']).toMatchObject({ choiceCounts: { 'choice-correct': 1, 'choice-2': 0 } })
    expect(snapshot?.players[0]).toMatchObject({ id: player.id, score: first.earnedScore })
  })

  it('expires every live-session key after finalisation', async () => {
    const session = await createSession(quiz, '654321')
    await expireSession(session.id)
    await expect(getRedis().ttl(`game:${session.id}:state`)).resolves.toBeGreaterThan(0)
  })
})
