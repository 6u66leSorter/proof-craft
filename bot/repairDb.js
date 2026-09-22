/**
 * Repair script — run ONCE to fix broken guest-role migration artifacts.
 * Usage: node bot/repairDb.js
 */
import 'dotenv/config'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = join(__dirname, '..', 'data', 'barber.db')

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

const tables = () =>
  new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name))

console.log('Current tables:', [...tables()].join(', '))

db.pragma('foreign_keys = OFF')

const t = tables()

// --- user_roles_legacy ---
if (t.has('user_roles_legacy') && !t.has('user_roles')) {
  db.prepare(`ALTER TABLE user_roles_legacy RENAME TO user_roles`).run()
  console.log('Restored user_roles from user_roles_legacy')
} else if (t.has('user_roles_legacy') && t.has('user_roles')) {
  db.prepare(`DROP TABLE user_roles_legacy`).run()
  console.log('Dropped orphaned user_roles_legacy')
}

// --- users_legacy ---
if (t.has('users_legacy') && !t.has('users')) {
  db.prepare(`ALTER TABLE users_legacy RENAME TO users`).run()
  console.log('Restored users from users_legacy')
} else if (t.has('users_legacy') && t.has('users')) {
  const nUsers = db.prepare(`SELECT count(*) AS c FROM users`).get().c
  const nLeg   = db.prepare(`SELECT count(*) AS c FROM users_legacy`).get().c
  console.log(`Both users (${nUsers} rows) and users_legacy (${nLeg} rows) exist`)
  if (nUsers === 0 && nLeg > 0) {
    db.prepare(`DROP TABLE users`).run()
    db.prepare(`ALTER TABLE users_legacy RENAME TO users`).run()
    console.log('Replaced empty users with users_legacy')
  } else {
    db.prepare(`DROP TABLE users_legacy`).run()
    console.log('Dropped orphaned users_legacy')
  }
}

db.pragma('foreign_keys = ON')

console.log('Tables after repair:', [...tables()].join(', '))
console.log('Done. Now restart the app: pm2 restart barber-api barber-bot')

db.close()
