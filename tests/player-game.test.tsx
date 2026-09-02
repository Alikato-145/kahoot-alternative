import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayerQuestion } from '@/components/game/PlayerQuestion'

const question = {
  id: 'question-1',
  position: 0,
  body: 'รูปทรงใดมีสามด้าน?',
  questionImageUrl: '/media/triangle.webp',
  revealImageUrl: null,
  explanation: null,
  choices: [
    { id: 'choice-1', position: 0, body: 'สามเหลี่ยม', isCorrect: true },
    { id: 'choice-2', position: 1, body: 'สี่เหลี่ยมข้าวหลามตัด', isCorrect: false },
    { id: 'choice-3', position: 2, body: 'วงกลม', isCorrect: false },
    { id: 'choice-4', position: 3, body: 'สี่เหลี่ยมจัตุรัส', isCorrect: false },
  ],
}

describe('PlayerQuestion', () => {
  it('renders the four enabled answer tiles while a question is accepting answers', () => {
    const markup = renderToStaticMarkup(<PlayerQuestion question={question} phase="answering" onAnswer={vi.fn()} />)

    expect(markup).toContain('aria-label="สามเหลี่ยม"')
    expect(markup).not.toContain('disabled')
  })

  it('disables every answer tile after a player submits one answer', () => {
    const markup = renderToStaticMarkup(<PlayerQuestion question={question} phase="answering" onAnswer={vi.fn()} submitted />)

    expect((markup.match(/disabled/g) ?? [])).toHaveLength(4)
  })
})
