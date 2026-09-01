import { describe, expect, it } from 'vitest'
import { createQuiz, getQuiz } from '@/server/repositories/quizzes'

process.env.DATABASE_URL ??= 'mysql://campquiz:campquiz@localhost:3306/camp_quiz'
process.env.REDIS_URL ??= 'redis://localhost:6379'

const questionInput = {
  body: 'ประเทศไทยมีชื่อเรียกอีกชื่อว่าอะไร',
  choices: [
    { body: 'สยาม', isCorrect: true },
    { body: 'ลาว', isCorrect: false },
    { body: 'กัมพูชา', isCorrect: false },
    { body: 'เวียดนาม', isCorrect: false },
  ],
}

describe('quiz repository', () => {
  it('rejects a question without four choices before it writes to MySQL', async () => {
    await expect(createQuiz({
      title: 'ค่าย',
      description: '',
      questions: [{ body: 'คำถาม', choices: questionInput.choices.slice(0, 3) }],
    })).rejects.toThrow('exactly four choices')
  })

  it('persists a question with exactly four ordered choices', async () => {
    const quiz = await createQuiz({
      title: 'ค่าย',
      description: '',
      questions: [questionInput],
    })

    const loaded = await getQuiz(quiz.id)

    expect(loaded?.questions[0]?.choices.map((choice) => choice.position)).toEqual([0, 1, 2, 3])
  })
})
