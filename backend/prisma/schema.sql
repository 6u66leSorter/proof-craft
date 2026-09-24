-- Схема SQLite «Дневника академии» (перенесена из legacy-миграций; Prisma-модели — в schema.prisma).
-- Применяется к пустой базе скриптом dist/database/init-schema.js (src/database/init-schema.ts).

CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      role TEXT NOT NULL DEFAULT 'guest' CHECK(role IN ('student', 'teacher', 'admin', 'guest')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    , vk_user_id INTEGER);

CREATE TABLE user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin', 'guest')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, role),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      lessons_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'moderation' CHECK(status IN ('moderation', 'studying', 'completed', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), student_track TEXT NOT NULL DEFAULT 'student', metro TEXT, avatar_file_id TEXT, about_me TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), about_me TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE student_teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
      UNIQUE(student_id, teacher_id)
    );

CREATE TABLE homeworks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      lesson_number INTEGER,
      is_bonus INTEGER NOT NULL DEFAULT 0 CHECK(is_bonus IN (0, 1)),
      content_type TEXT NOT NULL CHECK(content_type IN ('photo', 'video', 'text', 'document')),
      file_id TEXT,
      text_content TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'revision')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), haircut_name TEXT, revision_student_text TEXT, revision_student_file_id TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

CREATE TABLE homework_reviews (
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

CREATE TABLE app_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      payload TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

CREATE TABLE chat_messages (
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

CREATE TABLE vk_link_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE student_profile_edits (
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

CREATE TABLE teacher_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_user_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE homework_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      homework_id INTEGER NOT NULL,
      file_id TEXT NOT NULL,
      content_type TEXT NOT NULL CHECK(content_type IN ('photo', 'video', 'text', 'document')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE
    );

CREATE TABLE homework_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      homework_id INTEGER NOT NULL,
      author_user_id INTEGER NOT NULL,
      text_content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE web_login_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('telegram', 'vk')),
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      expires_at TEXT NOT NULL,
      approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE web_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE private_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL,
    subject TEXT NOT NULL CHECK(subject IN ('teacher','academy','other')),
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id, request_key)
  );

CREATE TABLE feedback_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    milestone INTEGER NOT NULL CHECK(milestone IN (5,10,15)),
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id, milestone)
  );

CREATE INDEX idx_users_telegram_id ON users(telegram_id);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

CREATE INDEX idx_user_roles_role ON user_roles(role);

CREATE INDEX idx_students_user_id ON students(user_id);

CREATE INDEX idx_students_status ON students(status);

CREATE INDEX idx_teachers_user_id ON teachers(user_id);

CREATE INDEX idx_student_teachers_student ON student_teachers(student_id);

CREATE INDEX idx_student_teachers_teacher ON student_teachers(teacher_id);

CREATE INDEX idx_homeworks_student ON homeworks(student_id);

CREATE INDEX idx_homeworks_status ON homeworks(status);

CREATE INDEX idx_homework_reviews_homework ON homework_reviews(homework_id);

CREATE INDEX idx_homework_reviews_teacher ON homework_reviews(teacher_id);

CREATE INDEX idx_app_notifications_user ON app_notifications(user_id);

CREATE INDEX idx_app_notifications_unread ON app_notifications(user_id, read_at);

CREATE INDEX idx_audit_log_created ON audit_log(created_at);

CREATE INDEX idx_chat_messages_student_id ON chat_messages(student_id, id);

CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_user_id);

CREATE UNIQUE INDEX idx_users_vk_user_id_unique ON users(vk_user_id)
        WHERE vk_user_id IS NOT NULL;

CREATE INDEX idx_vk_link_tokens_user ON vk_link_tokens(user_id);

CREATE INDEX idx_vk_link_tokens_expires ON vk_link_tokens(expires_at);

CREATE INDEX idx_profile_edits_student ON student_profile_edits(student_id);

CREATE INDEX idx_profile_edits_status ON student_profile_edits(status);

CREATE INDEX idx_teacher_apps_status ON teacher_applications(status);

CREATE INDEX idx_teacher_apps_user ON teacher_applications(applicant_user_id);

CREATE INDEX idx_homework_files_homework ON homework_files(homework_id);

CREATE INDEX idx_homework_comments_homework ON homework_comments(homework_id, id);

CREATE INDEX idx_web_login_requests_token ON web_login_requests(token_hash);

CREATE INDEX idx_web_login_requests_expires ON web_login_requests(expires_at);

CREATE INDEX idx_web_sessions_token ON web_sessions(token_hash);

CREATE INDEX idx_web_sessions_expires ON web_sessions(expires_at);
