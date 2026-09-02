'use client'
import React from 'react'
import type { Question } from '@/server/repositories/quizzes'
import type { GamePhase } from '@/server/game/types'
import { AnswerTile } from '@/components/ui/AnswerTile'
import { QuestionMedia } from '@/components/ui/QuestionMedia'
export function PlayerQuestion({ question, phase, onAnswer, submitted = false }: { question: Question; phase: GamePhase; onAnswer: (choiceId: string) => void; submitted?: boolean }) {
  const acceptingAnswers = phase === 'answering' && !submitted
  return <section className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-5"><QuestionMedia src={question.questionImageUrl ?? undefined} alt={question.body} /><h1 className="text-center text-3xl font-black sm:text-5xl">{question.body}</h1>{phase === 'question-intro' && <p role="status" className="text-center text-xl">เตรียมตัว…</p>}{submitted && <p role="status" className="text-center text-xl">ส่งคำตอบแล้ว รอผลลัพธ์…</p>}<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{question.choices.map((choice, index) => <AnswerTile key={choice.id} index={index} label={choice.body} disabled={!acceptingAnswers} onClick={() => onAnswer(choice.id)} />)}</div></section>
}
