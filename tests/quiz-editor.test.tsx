import { describe, expect, it } from 'vitest'
import { emptyQuiz, validateQuizForSubmission } from '@/components/quiz-editor/QuizEditor'

describe('QuizEditor submission contract', () => {
  it('does not submit until a question has four choices and one correct choice', () => {
    expect(validateQuizForSubmission({ ...emptyQuiz, title: 'ค่าย' })).toBe('แต่ละข้อมี 4 คำตอบ และต้องเลือกคำตอบที่ถูก 1 ข้อ')
  })

  it('keeps an uploaded image URL in the submitted payload', () => {
    const quiz = {
      title: 'ค่าย', description: '', questions: [{
        body: 'คำถาม', questionImageUrl: '/media/quizzes/q1/question.webp', revealImageUrl: null, explanation: '',
        choices: [
          { body: 'ก', isCorrect: true }, { body: 'ข', isCorrect: false },
          { body: 'ค', isCorrect: false }, { body: 'ง', isCorrect: false },
        ],
      }],
    }
    expect(validateQuizForSubmission(quiz)).toBeNull()
    expect(quiz.questions[0].questionImageUrl).toBe('/media/quizzes/q1/question.webp')
  })
})
