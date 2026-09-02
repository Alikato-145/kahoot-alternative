'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Quiz, QuizInput } from '@/server/repositories/quizzes'
import { quizApi } from '@/lib/api'
import { QuestionEditor } from './QuestionEditor'

export type EditorQuestion = QuizInput['questions'][number]
export type EditorQuiz = { id?: string; title: string; description: string; coverImageUrl?: string | null; questions: EditorQuestion[] }

const blankQuestion = (): EditorQuestion => ({ body: '', questionImageUrl: null, revealImageUrl: null, explanation: '', choices: Array.from({ length: 4 }, () => ({ body: '', isCorrect: false })) })
export const emptyQuiz: EditorQuiz = { title: '', description: '', coverImageUrl: null, questions: [blankQuestion()] }

export function validateQuizForSubmission(quiz: EditorQuiz): string | null {
  if (!quiz.title.trim()) return 'กรุณากรอกชื่อ Quiz'
  if (quiz.questions.length === 0 || quiz.questions.some((question) => question.choices.length !== 4 || question.choices.filter((choice) => choice.isCorrect).length !== 1)) return 'แต่ละข้อมี 4 คำตอบ และต้องเลือกคำตอบที่ถูก 1 ข้อ'
  if (quiz.questions.some((question) => !question.body.trim() || question.choices.some((choice) => !choice.body.trim()))) return 'กรุณากรอกคำถามและคำตอบให้ครบ'
  return null
}

function toEditorQuiz(quiz: Quiz): EditorQuiz { return { id: quiz.id, title: quiz.title, description: quiz.description, coverImageUrl: quiz.coverImageUrl, questions: quiz.questions.map(({ body, questionImageUrl, revealImageUrl, explanation, choices }) => ({ body, questionImageUrl, revealImageUrl, explanation: explanation ?? '', choices: choices.map(({ body: choiceBody, isCorrect }) => ({ body: choiceBody, isCorrect })) })) } }

export function QuizEditor({ initialQuiz, quizId }: { initialQuiz?: Quiz; quizId?: string }) {
  const router = useRouter()
  const [quiz, setQuiz] = useState<EditorQuiz>(initialQuiz ? toEditorQuiz(initialQuiz) : emptyQuiz)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const uploadQuizId = quizId ?? initialQuiz?.id

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validationError = validateQuizForSubmission(quiz)
    if (validationError) { setError(validationError); return }
    setSaving(true); setError(null)
    try {
      const saved = quizId ? await quizApi.update(quizId, quiz) : await quizApi.create(quiz)
      router.push(`/host/quizzes/${saved.id}/edit`)
      router.refresh()
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'บันทึก Quiz ไม่สำเร็จ') } finally { setSaving(false) }
  }

  return <form onSubmit={(event) => void submit(event)} className="mx-auto max-w-4xl space-y-6 p-6">
    <div><h1 className="text-3xl font-bold">{quizId ? 'แก้ไข Quiz' : 'สร้าง Quiz ใหม่'}</h1><p className="mt-1 text-slate-600">แต่ละคำถามต้องมี 4 ตัวเลือกและคำตอบที่ถูกต้อง 1 ข้อ</p></div>
    {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
    <label className="block font-medium">ชื่อ Quiz<input className="mt-1 block w-full rounded border p-2" value={quiz.title} onChange={(event) => setQuiz({ ...quiz, title: event.target.value })} required /></label>
    <label className="block font-medium">รายละเอียด<textarea className="mt-1 block w-full rounded border p-2" value={quiz.description} onChange={(event) => setQuiz({ ...quiz, description: event.target.value })} /></label>
    {!uploadQuizId && <p className="rounded bg-amber-50 p-3 text-amber-900">บันทึก Quiz ก่อนจึงจะอัปโหลดรูปคำถามหรือรูปเฉลยได้</p>}
    {quiz.questions.map((question, index) => <QuestionEditor key={index} question={question} index={index} quizId={uploadQuizId} onChange={(updated) => setQuiz({ ...quiz, questions: quiz.questions.map((item, current) => current === index ? updated : item) })} onRemove={() => setQuiz({ ...quiz, questions: quiz.questions.filter((_, current) => current !== index) })} />)}
    <button type="button" className="rounded bg-slate-200 px-4 py-2" onClick={() => setQuiz({ ...quiz, questions: [...quiz.questions, blankQuestion()] })}>เพิ่มคำถาม</button>
    <div className="flex gap-3"><button type="submit" disabled={saving} className="rounded bg-purple-700 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'บันทึก Quiz'}</button><button type="button" className="rounded border px-5 py-3" onClick={() => router.push('/host')}>ยกเลิก</button></div>
  </form>
}
