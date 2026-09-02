'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { GameSnapshot, LivePlayer } from '@/server/game/types'
import type { Question } from '@/server/repositories/quizzes'
import { getGameSocket } from '@/lib/socket'
import { GameShell } from '@/components/ui/GameShell'
import { HostLobby } from './HostLobby'
import { HostQuestion } from './HostQuestion'
import { HostReveal, type HostRevealPayload } from './HostReveal'

type RevealEvent = HostRevealPayload & { questionId: string }
export function playerJoinUrl(pin: string, origin: string): string { return `${origin.replace(/\/$/, '')}/join?pin=${encodeURIComponent(pin)}` }

export function HostGame({ sessionId, hostToken }: { sessionId: string; hostToken: string }) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [phase, setPhase] = useState<GameSnapshot['state']['phase']>('lobby')
  const [questionId, setQuestionId] = useState<string | null>(null)
  const [reveal, setReveal] = useState<RevealEvent | null>(null)
  const [players, setPlayers] = useState<LivePlayer[]>([])
  const [rankBroadcast, setRankBroadcast] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const socket = getGameSocket()
    const join = () => socket.emit('host:join', { sessionId, hostToken })
    const onState = (next: GameSnapshot) => { setSnapshot(next); setPlayers(next.players); setPhase(next.state.phase); const index = next.state.currentQuestionIndex; setQuestionId(index === null ? null : next.quiz.questions[index]?.id ?? null); setRankBroadcast(next.state.phase === 'score-rank') }
    const onLobby = (next: LivePlayer[]) => setPlayers(next)
    const onIntro = ({ questionId: id }: { questionId: string }) => { setQuestionId(id); setPhase('question-intro'); setReveal(null); setRankBroadcast(false) }
    const onOpen = ({ questionId: id }: { questionId: string }) => { setQuestionId(id); setPhase('answering') }
    const onReveal = (next: RevealEvent) => { setQuestionId(next.questionId); setReveal(next); setPhase('reveal') }
    const onRanks = (next: LivePlayer[]) => { setPlayers(next); setPhase('score-rank'); setRankBroadcast(true) }
    const onError = ({ message }: { message: string }) => setError(message)
    socket.on('connect', join).on('game:state', onState).on('lobby:players', onLobby).on('question:intro', onIntro).on('question:open', onOpen).on('question:reveal', onReveal).on('leaderboard:update', onRanks).on('game:error', onError)
    if (socket.connected) join()
    return () => { socket.off('connect', join).off('game:state', onState).off('lobby:players', onLobby).off('question:intro', onIntro).off('question:open', onOpen).off('question:reveal', onReveal).off('leaderboard:update', onRanks).off('game:error', onError) }
  }, [hostToken, sessionId])

  const question = useMemo<Question | undefined>(() => snapshot?.quiz.questions.find((candidate) => candidate.id === questionId), [snapshot, questionId])
  if (error) return <GameShell><p role="alert">{error}</p></GameShell>
  if (!snapshot) return <GameShell><p role="status">กำลังเชื่อมต่อหน้าจอผู้จัดเกม…</p></GameShell>
  const playerUrl = playerJoinUrl(snapshot.state.pin, typeof window === 'undefined' ? '' : window.location.origin)
  const controls = phase === 'lobby' ? undefined : phase === 'answering' ? <button className="rounded-xl bg-white px-6 py-3 text-xl font-black text-purple-950" type="button" onClick={() => getGameSocket().emit('host:reveal')}>ปิดรับคำตอบ / ดูเฉลย</button> : rankBroadcast ? <button className="rounded-xl bg-white px-6 py-3 text-xl font-black text-purple-950" type="button" onClick={() => getGameSocket().emit('host:next')}>ข้อต่อไป</button> : undefined
  return <GameShell header={<div className="flex items-center justify-between gap-4"><span className="font-black">{snapshot.quiz.title}</span>{controls}</div>}>
    {phase === 'lobby' ? <HostLobby pin={snapshot.state.pin} playerUrl={playerUrl} players={players} onStart={() => getGameSocket().emit('host:start')} /> : question && (phase === 'reveal' || phase === 'score-rank') && reveal ? <HostReveal question={question} reveal={reveal} /> : question ? <HostQuestion question={question} deadlineAt={snapshot.state.deadlineAt} answerCount={Object.keys(snapshot.answers[question.id]?.playerAnswers ?? {}).length} /> : <p role="status">กำลังรอคำถาม…</p>}
  </GameShell>
}
