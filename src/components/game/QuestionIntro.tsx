import React from 'react'

/** Neutral transition screen: question text and media stay hidden until answering opens. */
export function QuestionIntro() {
  return <section aria-label="กำลังเตรียมคำถาม" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
    <p className="text-2xl font-black sm:text-4xl">เตรียมตัว…</p>
    <p className="text-lg text-purple-200">คำถามกำลังจะเริ่ม</p>
  </section>
}
