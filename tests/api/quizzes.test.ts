import { beforeEach, describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({
  createQuiz: vi.fn(), getQuiz: vi.fn(), listQuizzes: vi.fn(), updateQuiz: vi.fn(), deleteQuiz: vi.fn(),
}))
vi.mock('@/server/repositories/quizzes', () => repository)
vi.mock('@/server/media', () => ({ removeQuizMedia: vi.fn() }))

const validQuiz = {
  title: 'ค่ายฤดูร้อน', description: '', questions: [{ body: 'คำถาม', choices: [
    { body: 'ก', isCorrect: true }, { body: 'ข', isCorrect: false },
    { body: 'ค', isCorrect: false }, { body: 'ง', isCorrect: false },
  ] }],
}

describe('quiz API routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a quiz question with three choices', async () => {
    const { POST } = await import('@/app/api/quizzes/route')
    const response = await POST(new Request('http://localhost/api/quizzes', {
      method: 'POST', body: JSON.stringify({ ...validQuiz, questions: [{ ...validQuiz.questions[0], choices: validQuiz.questions[0].choices.slice(0, 3) }] }),
      headers: { 'content-type': 'application/json' },
    }))
    expect(response.status).toBe(422)
    expect(repository.createQuiz).not.toHaveBeenCalled()
  })

  it('creates a validated quiz and lists quizzes', async () => {
    repository.createQuiz.mockResolvedValue({ id: 'quiz-1', ...validQuiz })
    repository.listQuizzes.mockResolvedValue([{ id: 'quiz-1', ...validQuiz }])
    const route = await import('@/app/api/quizzes/route')
    const created = await route.POST(new Request('http://localhost/api/quizzes', { method: 'POST', body: JSON.stringify(validQuiz), headers: { 'content-type': 'application/json' } }))
    const listed = await route.GET()
    expect(created.status).toBe(201)
    expect(await listed.json()).toEqual([{ id: 'quiz-1', ...validQuiz }])
  })

  it('returns 404 for an unknown quiz', async () => {
    repository.getQuiz.mockResolvedValue(null)
    const { GET } = await import('@/app/api/quizzes/[id]/route')
    expect((await GET(new Request('http://localhost/api/quizzes/missing'), { params: { id: 'missing' } })).status).toBe(404)
  })
})
