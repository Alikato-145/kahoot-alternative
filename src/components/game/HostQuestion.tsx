'use client'

import React from 'react'
import type { Question } from '@/server/repositories/quizzes'
import { QuestionMedia } from '@/components/ui/QuestionMedia'
import { Timer } from '@/components/ui/Timer'

export function HostQuestion({ question, deadlineAt, answerCount, choiceCounts }: { question: Question; deadlineAt: number | null; answerCount: number; choiceCounts?: Record<string, number> }) {
  const showDistribution = Boolean(choiceCounts)
  const total = Object.values(choiceCounts ?? {}).reduce((sum, count) => sum + count, 0)
  return <section className="space-y-6 text-center" aria-label="คำถามสำหรับผู้จัดเกม"><div className="flex items-center justify-between gap-4"><p className="text-xl font-bold">ตอบแล้ว {answerCount} คน</p>{deadlineAt ? <Timer deadline={deadlineAt} /> : <span className="rounded-full bg-white px-4 py-2 font-black text-purple-950">เตรียมตัว</span>}</div><QuestionMedia src={question.questionImageUrl ?? undefined} alt={question.body} className="mx-auto" /><h1 className="text-3xl font-black leading-tight sm:text-6xl">{question.body}</h1>{showDistribution ? <div className="grid gap-3 sm:grid-cols-4">{question.choices.map((choice) => { const count = choiceCounts?.[choice.id] ?? 0; const percent = total ? Math.round(count * 100 / total) : 0; return <div key={choice.id} className="rounded-xl bg-white/15 p-4"><div className="mx-auto flex h-36 items-end"><div className="w-full rounded-t bg-white" style={{ height: `${percent}%` }} /></div><p className="mt-2 font-bold">{choice.body}</p><p>{count} คน</p></div> })}</div> : null}</section>
}
