'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { io, type Socket } from 'socket.io-client'
import type { GameSnapshot } from '@/server/game/types'

/** Task 4 protocol bridge. Projected Host views are added in Task 9. */
export default function HostGamePage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const hostToken = searchParams.get('hostToken')

  useEffect(() => {
    if (!hostToken) { setError('ลิงก์ผู้จัดเกมไม่ถูกต้อง'); return }
    const connection = io({ path: '/socket.io' })
    connection.on('connect', () => connection.emit('host:join', { sessionId: params.id, hostToken }))
    connection.on('game:state', (nextSnapshot: GameSnapshot) => setSnapshot(nextSnapshot))
    connection.on('game:error', ({ message }: { message: string }) => setError(message))
    setSocket(connection)
    return () => { setSocket(null); connection.disconnect() }
  }, [hostToken, params.id])

  return <main className="min-h-screen p-8"><h1 className="text-3xl font-bold">หน้าจอผู้จัดเกม</h1>{error && <p role="alert" className="mt-4 text-red-700">{error}</p>}{!snapshot ? <p className="mt-4" role="status">กำลังเชื่อมต่อเกม…</p> : <section className="mt-6 space-y-4"><p>PIN: <strong>{snapshot.state.pin}</strong></p><p>ผู้เล่น: {snapshot.players.map((player) => player.nickname).join(', ') || 'ยังไม่มีผู้เล่น'}</p><p>สถานะ: {snapshot.state.phase}</p>{snapshot.state.phase === 'lobby' && <button disabled={!socket} className="rounded bg-purple-700 px-5 py-3 font-bold text-white" onClick={() => socket?.emit('host:start')}>เริ่มเกม</button>}</section>}</main>
}
