import { expect, it } from 'vitest'
import { loadConfig } from '@/server/config'

it('rejects a missing database URL', () => {
  expect(() => loadConfig({ REDIS_URL: 'redis://localhost:6379' })).toThrow('DATABASE_URL')
})
