import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { initSchema } from '../../src/database/init-schema.js'

export type TestDatabaseFixture = {
  databasePath: string
  temporaryRoot: string
}

/** Пустая SQLite со схемой из prisma/schema.sql во временном каталоге (рядом — uploads). */
export const createTestDatabase = async (prefix: string): Promise<TestDatabaseFixture> => {
  const temporaryRoot = await mkdtemp(join(os.tmpdir(), prefix))
  const databasePath = join(temporaryRoot, 'data', 'barber.db')
  initSchema(databasePath)
  return { databasePath, temporaryRoot }
}
