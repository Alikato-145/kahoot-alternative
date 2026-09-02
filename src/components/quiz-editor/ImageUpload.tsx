'use client'

import { useId, useState } from 'react'
import { quizApi } from '@/lib/api'

type Props = { quizId?: string; label: string; value: string | null; onChange: (url: string | null) => void }

export function canUploadImages(quizId: string | undefined): quizId is string { return Boolean(quizId) }

export function ImageUpload({ quizId, label, value, onChange }: Props) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File | undefined) {
    if (!file) return
    if (!canUploadImages(quizId)) { setError('บันทึก Quiz ก่อนจึงจะอัปโหลดรูปได้'); return }
    setUploading(true); setError(null)
    try { onChange(await quizApi.uploadImage(quizId, file)) } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'อัปโหลดรูปไม่สำเร็จ') } finally { setUploading(false) }
  }

  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    <input id={id} type="file" disabled={!canUploadImages(quizId)} accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void upload(event.target.files?.[0])} />
    {uploading && <p className="text-sm" role="status">กำลังอัปโหลดรูป…</p>}
    {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    {value && <div className="flex items-center gap-3"><img src={value} alt={label} className="h-20 w-28 rounded object-cover" /><button type="button" className="text-sm underline" onClick={() => onChange(null)}>ลบรูป</button></div>}
  </div>
}
