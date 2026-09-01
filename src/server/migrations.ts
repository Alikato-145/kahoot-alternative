import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RowDataPacket } from 'mysql2'
import { getPool, transaction } from './db'

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database/migrations')

export async function runMigrations(): Promise<string[]> {
  const pool = getPool()
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)

  const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort()
  const [rows] = await pool.query<Array<RowDataPacket & { filename: string }>>('SELECT filename FROM schema_migrations')
  const executed = new Set(rows.map((row) => row.filename))
  const applied: string[] = []

  for (const filename of files) {
    if (executed.has(filename)) continue
    const sql = await readFile(path.join(migrationDirectory, filename), 'utf8')
    await transaction(async (connection) => {
      await connection.query(sql)
      await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [filename])
    })
    applied.push(filename)
  }
  return applied
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then((applied) => console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'No migrations to run.'))
    .then(() => getPool().end())
    .catch(async (error) => {
      console.error(error)
      await getPool().end()
      process.exitCode = 1
    })
}
