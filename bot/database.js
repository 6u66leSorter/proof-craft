import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dataDir = join(__dirname, '..', 'data')
const dbPath = join(dataDir, 'barber.db')

try {
  mkdirSync(dataDir, { recursive: true })
} catch (error) {
  if (error.code !== 'EEXIST') {
    throw error
  }
}

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
/** Два процесса (api + bot) открывают одну БД — снижает SQLITE_BUSY и шанс «рваной» миграции */
db.pragma('busy_timeout = 8000')
db.pragma('foreign_keys = ON')

const runGuestRoleMigration = (database) => {
  const userRolesSql = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_roles'`)
    .get()?.sql
  const usersSql = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get()?.sql

  const needUserRoles = userRolesSql && !userRolesSql.includes("'guest'")
  const needUsers = usersSql && !usersSql.includes("'guest'")
  if (!needUserRoles && !needUsers) return

  // Modify CHECK constraints directly in sqlite_master — no table recreation needed.
  // writable_schema must be set outside of any transaction.
  database.pragma('writable_schema = ON')

  if (needUserRoles) {
    database.prepare(`UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = 'user_roles'`).run(
      userRolesSql.replace(
        `CHECK(role IN ('student', 'teacher', 'admin'))`,
        `CHECK(role IN ('student', 'teacher', 'admin', 'guest'))`,
      ),
    )
  }

  if (needUsers) {
    database.prepare(`UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = 'users'`).run(
      usersSql
        .replace(
          `CHECK(role IN ('student', 'teacher', 'admin'))`,
          `CHECK(role IN ('student', 'teacher', 'admin', 'guest'))`,
        )
        .replace(`DEFAULT 'student'`, `DEFAULT 'guest'`),
    )
  }

  database.pragma('writable_schema = OFF')
  // Bump schema_version so SQLite invalidates its compiled-statement cache
  const ver = database.pragma('schema_version', { simple: true })
  database.pragma(`schema_version = ${ver + 1}`)

}

/** Уровень ученика в обучении (макет нового фронта): ученик / стажёр / барбер */
const runStudentTrackMigration = (database) => {
  const names = database.prepare(`PRAGMA table_info(students)`).all().map((c) => c.name)
  if (!names.includes('student_track')) {
    database.prepare(`ALTER TABLE students ADD COLUMN student_track TEXT NOT NULL DEFAULT 'student'`).run()
  }
}

const initDatabase = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      role TEXT NOT NULL DEFAULT 'guest' CHECK(role IN ('student', 'teacher', 'admin', 'guest')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin', 'guest')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, role),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      lessons_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'moderation' CHECK(status IN ('moderation', 'studying', 'completed', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
      UNIQUE(student_id, teacher_id)
    );

    CREATE TABLE IF NOT EXISTS homeworks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      lesson_number INTEGER,
      is_bonus INTEGER NOT NULL DEFAULT 0 CHECK(is_bonus IN (0, 1)),
      content_type TEXT NOT NULL CHECK(content_type IN ('photo', 'video', 'text', 'document')),
      file_id TEXT,
      text_content TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'revision')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS homework_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      homework_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      status TEXT NOT NULL CHECK(status IN ('approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
    CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
    CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
    CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);
    CREATE INDEX IF NOT EXISTS idx_student_teachers_student ON student_teachers(student_id);
    CREATE INDEX IF NOT EXISTS idx_student_teachers_teacher ON student_teachers(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_homeworks_student ON homeworks(student_id);
    CREATE INDEX IF NOT EXISTS idx_homeworks_status ON homeworks(status);
    CREATE INDEX IF NOT EXISTS idx_homework_reviews_homework ON homework_reviews(homework_id);
    CREATE INDEX IF NOT EXISTS idx_homework_reviews_teacher ON homework_reviews(teacher_id);

    CREATE TABLE IF NOT EXISTS app_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      payload TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_app_notifications_user ON app_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_app_notifications_unread ON app_notifications(user_id, read_at);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      sender_user_id INTEGER NOT NULL,
      text_content TEXT,
      content_type TEXT NOT NULL CHECK(content_type IN ('text', 'photo', 'video', 'document', 'system')),
      file_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_student_id ON chat_messages(student_id, id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_user_id);

  `)

  db.exec(`
    INSERT OR IGNORE INTO user_roles (user_id, role)
    SELECT id, role FROM users WHERE role IS NOT NULL;
  `)

  const homeworkColumns = db.prepare(`PRAGMA table_info(homeworks)`).all()
  if (!homeworkColumns.some((col) => col.name === 'haircut_name')) {
    db.exec(`ALTER TABLE homeworks ADD COLUMN haircut_name TEXT`)
  }

  const studentsCreateSql = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'students'`)
    .get()?.sql
  if (studentsCreateSql && studentsCreateSql.includes("'active'")) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE IF NOT EXISTS student_teachers_backup (
        student_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        UNIQUE(student_id, teacher_id)
      );
      DELETE FROM student_teachers_backup;
      INSERT OR IGNORE INTO student_teachers_backup (student_id, teacher_id)
      SELECT student_id, teacher_id FROM student_teachers;

      ALTER TABLE students RENAME TO students_legacy;
      CREATE TABLE students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        lessons_count INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'moderation' CHECK(status IN ('moderation', 'studying', 'completed', 'rejected')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO students (id, user_id, full_name, phone, lessons_count, status, created_at, updated_at)
      SELECT
        id,
        user_id,
        full_name,
        phone,
        lessons_count,
        CASE
          WHEN status = 'active' THEN 'studying'
          ELSE status
        END,
        created_at,
        updated_at
      FROM students_legacy;
      DROP TABLE students_legacy;
      CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
      CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

      DROP TABLE student_teachers;
      CREATE TABLE student_teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
        UNIQUE(student_id, teacher_id)
      );
      INSERT OR IGNORE INTO student_teachers (student_id, teacher_id)
      SELECT b.student_id, b.teacher_id
      FROM student_teachers_backup b
      JOIN students s ON s.id = b.student_id
      JOIN teachers t ON t.id = b.teacher_id;
      CREATE INDEX IF NOT EXISTS idx_student_teachers_student ON student_teachers(student_id);
      CREATE INDEX IF NOT EXISTS idx_student_teachers_teacher ON student_teachers(teacher_id);
      DROP TABLE student_teachers_backup;
    `)
    db.pragma('foreign_keys = ON')
  }

  runUserVkMigrations(db)
  runStudentTrackMigration(db)
  runStudentMetroMigration(db)
  runStudentAvatarMigration(db)
  runStudentAboutMigration(db)
  runTeacherAboutMigration(db)
  runTeacherApplicationsMigration(db)
  runHomeworkFilesMigration(db)
  runHomeworkCommentsMigration(db)
  runHomeworkRevisionColumnsMigration(db)
  runGuestRoleMigration(db)
  runWebAuthMigration(db)

  console.log('База данных инициализирована:', dbPath)
}

const runHomeworkRevisionColumnsMigration = (database) => {
  const names = database.prepare(`PRAGMA table_info(homeworks)`).all().map((c) => c.name)
  if (!names.includes('revision_student_text')) {
    database.prepare(`ALTER TABLE homeworks ADD COLUMN revision_student_text TEXT`).run()
  }
  if (!names.includes('revision_student_file_id')) {
    database.prepare(`ALTER TABLE homeworks ADD COLUMN revision_student_file_id TEXT`).run()
  }
}

const runHomeworkFilesMigration = (database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS homework_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      homework_id INTEGER NOT NULL,
      file_id TEXT NOT NULL,
      content_type TEXT NOT NULL CHECK(content_type IN ('photo', 'video', 'text', 'document')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_homework_files_homework ON homework_files(homework_id);
  `)
}

const runHomeworkCommentsMigration = (database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS homework_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      homework_id INTEGER NOT NULL,
      author_user_id INTEGER NOT NULL,
      text_content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_homework_comments_homework ON homework_comments(homework_id, id);
  `)
}

const runStudentMetroMigration = (database) => {
  const names = database.prepare(`PRAGMA table_info(students)`).all().map((c) => c.name)
  if (!names.includes('metro')) {
    database.prepare(`ALTER TABLE students ADD COLUMN metro TEXT`).run()
  }
}

const runStudentAvatarMigration = (database) => {
  const names = database.prepare(`PRAGMA table_info(students)`).all().map((c) => c.name)
  if (!names.includes('avatar_file_id')) {
    database.prepare(`ALTER TABLE students ADD COLUMN avatar_file_id TEXT`).run()
  }
}

const runStudentAboutMigration = (database) => {
  const names = database.prepare(`PRAGMA table_info(students)`).all().map((c) => c.name)
  if (!names.includes('about_me')) database.prepare(`ALTER TABLE students ADD COLUMN about_me TEXT`).run()
}

const runTeacherAboutMigration = (database) => {
  const names = database.prepare(`PRAGMA table_info(teachers)`).all().map((c) => c.name)
  if (!names.includes('about_me')) database.prepare(`ALTER TABLE teachers ADD COLUMN about_me TEXT`).run()
}

const runTeacherApplicationsMigration = (database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS teacher_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_user_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_teacher_apps_status ON teacher_applications(status);
    CREATE INDEX IF NOT EXISTS idx_teacher_apps_user ON teacher_applications(applicant_user_id);
  `)
}

const runUserVkMigrations = (database) => {
  const cols = database.prepare(`PRAGMA table_info(users)`).all()
  const names = cols.map((c) => c.name)
  if (!names.includes('vk_user_id')) {
    /** SQLite не даёт ADD COLUMN ... UNIQUE — колонка без ограничения, уникальность через частичный индекс */
    database.prepare(`ALTER TABLE users ADD COLUMN vk_user_id INTEGER`).run()
  }
  const hasVkCol = database
    .prepare(`PRAGMA table_info(users)`)
    .all()
    .some((c) => c.name === 'vk_user_id')
  if (hasVkCol) {
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_vk_user_id_unique ON users(vk_user_id)
        WHERE vk_user_id IS NOT NULL;
    `)
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS vk_link_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_vk_link_tokens_user ON vk_link_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_vk_link_tokens_expires ON vk_link_tokens(expires_at);
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS student_profile_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      new_full_name TEXT NOT NULL,
      new_phone TEXT NOT NULL,
      new_metro TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      admin_comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewed_by_telegram_id INTEGER,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_profile_edits_student ON student_profile_edits(student_id);
    CREATE INDEX IF NOT EXISTS idx_profile_edits_status ON student_profile_edits(status);
  `)
}

/** Одноразовые подтверждения входа на обычном сайте и его сессии. Храним только хэши токенов. */
const runWebAuthMigration = (database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS web_login_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('telegram', 'vk')),
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      expires_at TEXT NOT NULL,
      approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_web_login_requests_token ON web_login_requests(token_hash);
    CREATE INDEX IF NOT EXISTS idx_web_login_requests_expires ON web_login_requests(expires_at);

    CREATE TABLE IF NOT EXISTS web_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_web_sessions_token ON web_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_web_sessions_expires ON web_sessions(expires_at);
  `)
}

initDatabase()

db.exec(`
  CREATE TABLE IF NOT EXISTS private_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL,
    subject TEXT NOT NULL CHECK(subject IN ('teacher','academy','other')),
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id, request_key)
  );
  CREATE TABLE IF NOT EXISTS feedback_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    milestone INTEGER NOT NULL CHECK(milestone IN (5,10,15)),
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id, milestone)
  );
`)

export default db
