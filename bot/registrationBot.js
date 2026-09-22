import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import db from './database.js'
import { startFeedbackInvites } from './feedbackInvites.js'
import {
  getOrCreateUser,
  createStudent,
  getStudentByTelegramId,
  getStudentByUserId,
  getStudentsByStatus,
  getAllAdmins,
  UserRole,
  StudentStatus,
  getTeachersByStudent,
  assignTeacherToStudent,
  createHomework,
  getHomeworksByStudent,
  getStudentsWithPendingCount,
  getHomeworkById,
  createHomeworkReview,
  createAppNotification,
  createAppNotificationsForAdmins,
  HomeworkStatus,
  getUserRoles,
  getUserByTelegramId,
  addUserRole,
  removeUserRole,
  getTeacherByUserId,
  getTeacherById,
  createTeacher,
  deleteTeacherByUserId,
  getAllTeachers,
  getActiveStudents,
  approveWebLoginRequest,
} from './dbService.js'

const token =
  process.env.BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.VITE_TELEGRAM_BOT_TOKEN

if (!token) {
  console.error(
    'Не найден BOT_TOKEN. Укажите его в .env (BOT_TOKEN=...) или передайте через переменные окружения.',
  )
  process.exit(1)
}

const bot = new TelegramBot(token, { polling: true })
startFeedbackInvites(bot, process.env.WEB_APP_URL)

const RegistrationStep = {
  FullName: 'fullName',
  Phone: 'phone',
  Lessons: 'lessons',
  Completed: 'completed',
}

const HomeworkStep = {
  SelectType: 'selectType',
  LessonNumber: 'lessonNumber',
  Content: 'content',
  Completed: 'completed',
}

const ReviewStep = {
  SelectAction: 'selectAction',
  Rating: 'rating',
  Comment: 'comment',
  Completed: 'completed',
}

const AdminStep = {
  AssignTeacherById: 'assignTeacherById',
  RemoveTeacherById: 'removeTeacherById',
}

const sessions = new Map()

const formatTeacherLabel = (teacher) => {
  const username = teacher.username ? `@${teacher.username}` : null
  const name = teacher.full_name || [teacher.first_name, teacher.last_name].filter(Boolean).join(' ') || 'Преподаватель'
  const meta = [username, `id ${teacher.id}`].filter(Boolean).join(' · ')
  return `${name}${meta ? ` (${meta})` : ''}`
}

const formatStudentLabel = (student) => {
  const username = student.username ? `@${student.username}` : null
  const meta = [username, `id ${student.id}`].filter(Boolean).join(' · ')
  return `${student.full_name}${meta ? ` (${meta})` : ''}`
}

const validatePhone = (value) => {
  const trimmed = value.replace(/\s+/g, '')
  return /^(\+?\d{10,15})$/.test(trimmed)
}

const parseLessons = (value) => {
  const normalized = value.replace(',', '.').trim()
  const lessons = Number(normalized)
  if (!Number.isFinite(lessons) || lessons <= 0 || !Number.isInteger(lessons)) {
    return null
  }
  return lessons
}

const notifyAdmins = async (message, options = {}) => {
  const admins = getAllAdmins()
  for (const admin of admins) {
    try {
      await bot.sendMessage(admin.telegram_id, message, options)
    } catch (error) {
      console.error(`Ошибка отправки уведомления админу ${admin.telegram_id}:`, error.message)
    }
  }
}

bot.onText(/^\/start(?:\s+(.+))?/i, async (msg, match) => {
  const user = getOrCreateUser(msg.from.id, msg.from.username, msg.from.first_name, msg.from.last_name)
  const payload = String(match?.[1] || '').trim()
  const token = payload.startsWith('webauth_') ? payload.slice('webauth_'.length) : ''
  if (token) {
    const approved = approveWebLoginRequest(token, 'telegram', user.id)
    await bot.sendMessage(
      msg.chat.id,
      approved ? 'Вход подтверждён. Вернитесь в браузер — дневник откроется автоматически.' : 'Ссылка для входа истекла или уже была использована. Вернитесь на сайт и начните вход заново.',
    )
    return
  }
  await bot.sendMessage(
    msg.chat.id,
    'Привет! Чтобы войти в приложение, нажми на кнопку «Дневник» в левом нижнем углу.',
  )
})

bot.onText(/\/admin/i, async (msg) => {
  const user = getOrCreateUser(msg.from.id, msg.from.username, msg.from.first_name, msg.from.last_name)
  const roles = getUserRoles(user.id)
  if (!roles.includes(UserRole.ADMIN)) {
    await bot.sendMessage(msg.chat.id, 'У вас нет доступа к админ-панели.')
    return
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: '📋 Список на модерации', callback_data: 'admin_moderation' }],
      [{ text: '📋 Список активных учеников', callback_data: 'admin_active' }],
      [{ text: '👨‍🏫 Управление преподавателями', callback_data: 'admin_teachers' }],
    ],
  }
  await bot.sendMessage(msg.chat.id, '🔐 Админ-панель', { reply_markup: keyboard })
})

bot.onText(/\/teacher/i, async (msg) => {
  const user = getOrCreateUser(msg.from.id, msg.from.username, msg.from.first_name, msg.from.last_name)
  const roles = getUserRoles(user.id)
  if (!roles.includes(UserRole.TEACHER)) {
    await bot.sendMessage(msg.chat.id, 'У вас нет доступа к панели преподавателя.')
    return
  }

  const students = getStudentsWithPendingCount(user.id)
  if (students.length === 0) {
    await bot.sendMessage(msg.chat.id, '📝 У вас нет непроверенных заданий.')
    return
  }

  let message = '📝 Проверить задания:\n\n'
  for (const student of students) {
    message += `${student.full_name} (${student.pending_count} непроверенных)\n`
  }

  const keyboard = {
    inline_keyboard: students.map((s) => [
      {
        text: `${s.full_name} (${s.pending_count})`,
        callback_data: `teacher_student_${s.id}`,
      },
    ]),
  }

  await bot.sendMessage(msg.chat.id, message, { reply_markup: keyboard })
})

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id
  const data = query.data

  if (data === 'submit_homework') {
    const student = getStudentByTelegramId(query.from.id)
    if (!student || student.status !== StudentStatus.STUDYING) {
      await bot.answerCallbackQuery(query.id, { text: 'Вы не зарегистрированы или не активны.' })
      return
    }

    const homeworks = getHomeworksByStudent(student.id, true)
    const regularCount = homeworks.filter((h) => !h.is_bonus && h.status === HomeworkStatus.APPROVED).length

    if (regularCount >= student.lessons_count) {
      const keyboard = {
        inline_keyboard: [
          [{ text: '📚 Обычное задание', callback_data: 'hw_regular' }],
          [{ text: '⭐ Дополнительное задание', callback_data: 'hw_bonus' }],
        ],
      }
      await bot.sendMessage(chatId, 'Выберите тип задания:', { reply_markup: keyboard })
    } else {
      const keyboard = {
        inline_keyboard: [
          [{ text: `📚 Урок ${regularCount + 1}`, callback_data: `hw_lesson_${regularCount + 1}` }],
          [{ text: '⭐ Дополнительное задание', callback_data: 'hw_bonus' }],
        ],
      }
      await bot.sendMessage(
        chatId,
        `Выберите номер урока (от 1 до ${student.lessons_count}):`,
        { reply_markup: keyboard },
      )
    }
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data.startsWith('hw_')) {
    const student = getStudentByTelegramId(query.from.id)
    if (!student) {
      await bot.answerCallbackQuery(query.id, { text: 'Ошибка: студент не найден.' })
      return
    }

    if (data === 'hw_bonus') {
      sessions.set(chatId, {
        type: 'homework',
        step: HomeworkStep.Content,
        payload: { studentId: student.id, isBonus: true, lessonNumber: null },
      })
      await bot.sendMessage(chatId, '📎 Отправьте фото, видео или текстовое сообщение с заданием.')
      await bot.answerCallbackQuery(query.id)
      return
    }

    if (data.startsWith('hw_lesson_')) {
      const lessonNum = parseInt(data.replace('hw_lesson_', ''), 10)
      sessions.set(chatId, {
        type: 'homework',
        step: HomeworkStep.Content,
        payload: { studentId: student.id, isBonus: false, lessonNumber: lessonNum },
      })
      await bot.sendMessage(chatId, '📎 Отправьте фото, видео или текстовое сообщение с заданием.')
      await bot.answerCallbackQuery(query.id)
      return
    }
  }

  if (data === 'admin_moderation') {
    const students = getStudentsByStatus(StudentStatus.MODERATION)
    if (students.length === 0) {
      await bot.sendMessage(chatId, 'Нет заявок на модерации.')
      await bot.answerCallbackQuery(query.id)
      return
    }

    for (const student of students) {
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Одобрить', callback_data: `admin_approve_${student.id}` },
            { text: '❌ Отклонить', callback_data: `admin_reject_${student.id}` },
          ],
        ],
      }
      await bot.sendMessage(
        chatId,
        `Новый ученик: ${student.full_name}\nТелефон: ${student.phone}\nКоличество занятий: ${student.lessons_count}`,
        { reply_markup: keyboard },
      )
    }
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data === 'admin_teachers') {
    const keyboard = {
      inline_keyboard: [
        [{ text: '➕ Назначить преподавателя по ID', callback_data: 'admin_teachers_assign_id' }],
        [{ text: '➖ Удалить преподавателя по ID', callback_data: 'admin_teachers_remove_id' }],
        [{ text: '👥 Назначить ученика преподавателю', callback_data: 'admin_assign_teacher' }],
        [{ text: '📋 Список преподавателей', callback_data: 'admin_teachers_list' }],
      ],
    }
    await bot.sendMessage(chatId, '👨‍🏫 Управление преподавателями', { reply_markup: keyboard })
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data === 'admin_teachers_list') {
    const teachers = getAllTeachers()
    if (teachers.length === 0) {
      await bot.sendMessage(chatId, 'Список преподавателей пуст.')
      await bot.answerCallbackQuery(query.id)
      return
    }

    const message = teachers.map((teacher, index) => `${index + 1}. ${formatTeacherLabel(teacher)}`).join('\n')
    await bot.sendMessage(chatId, `Список преподавателей:\n${message}`)
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data === 'admin_teachers_assign_id') {
    sessions.set(chatId, { type: 'admin', step: AdminStep.AssignTeacherById })
    await bot.sendMessage(chatId, 'Отправьте Telegram ID пользователя, которого нужно назначить преподавателем.')
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data === 'admin_teachers_remove_id') {
    sessions.set(chatId, { type: 'admin', step: AdminStep.RemoveTeacherById })
    await bot.sendMessage(chatId, 'Отправьте Telegram ID преподавателя, которого нужно удалить.')
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data === 'admin_assign_teacher') {
    const teachers = getAllTeachers()
    if (teachers.length === 0) {
      await bot.sendMessage(chatId, 'Сначала назначьте преподавателя.')
      await bot.answerCallbackQuery(query.id)
      return
    }

    const keyboard = {
      inline_keyboard: teachers.map((teacher) => [
        { text: formatTeacherLabel(teacher), callback_data: `admin_assign_teacher_${teacher.id}` },
      ]),
    }
    await bot.sendMessage(chatId, 'Выберите преподавателя:', { reply_markup: keyboard })
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data.startsWith('admin_assign_teacher_')) {
    const teacherId = parseInt(data.replace('admin_assign_teacher_', ''), 10)
    if (!Number.isInteger(teacherId)) {
      await bot.answerCallbackQuery(query.id, { text: 'Некорректный преподаватель.' })
      return
    }

    const teacher = getTeacherById(teacherId)
    if (!teacher) {
      await bot.answerCallbackQuery(query.id, { text: 'Преподаватель не найден.' })
      return
    }

    const students = getActiveStudents()
    if (students.length === 0) {
      await bot.sendMessage(chatId, 'Нет активных учеников для назначения.')
      await bot.answerCallbackQuery(query.id)
      return
    }

    const keyboard = {
      inline_keyboard: students.map((student) => [
        {
          text: formatStudentLabel(student),
          callback_data: `admin_assign_student_${teacherId}_${student.id}`,
        },
      ]),
    }
    await bot.sendMessage(chatId, `Выберите ученика для преподавателя ${formatTeacherLabel(teacher)}:`, {
      reply_markup: keyboard,
    })
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data.startsWith('admin_assign_student_')) {
    const payload = data.replace('admin_assign_student_', '')
    const [teacherIdRaw, studentIdRaw] = payload.split('_')
    const teacherId = parseInt(teacherIdRaw, 10)
    const studentId = parseInt(studentIdRaw, 10)

    if (!Number.isInteger(teacherId) || !Number.isInteger(studentId)) {
      await bot.answerCallbackQuery(query.id, { text: 'Некорректные данные.' })
      return
    }

    assignTeacherToStudent(studentId, teacherId)
    await bot.answerCallbackQuery(query.id, { text: 'Ученик назначен преподавателю.' })
    await bot.sendMessage(chatId, '✅ Ученик назначен преподавателю.')
    return
  }

  if (data.startsWith('admin_approve_')) {
    const studentId = parseInt(data.replace('admin_approve_', ''), 10)
    // Сразу отвечаем на callback, чтобы Telegram не счёл запрос просроченным
    await bot.answerCallbackQuery(query.id).catch(() => {})

    db.prepare("UPDATE students SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      StudentStatus.STUDYING,
      studentId,
    )
    const student = db
      .prepare(
        `
      SELECT s.*, u.telegram_id
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `,
      )
      .get(studentId)
    await bot.sendMessage(chatId, `✅ Ученик ${student.full_name} одобрен и активирован.`)
    await bot.sendMessage(
      student.telegram_id,
      '🎉 Ваша заявка одобрена! Теперь вы можете сдавать домашние задания.',
    )
    const approvedMsg = '🎉 Ваша заявка одобрена! Теперь вы можете сдавать домашние задания.'
    createAppNotification(student.user_id, 'student_status', approvedMsg, {
      action: 'approve',
      student_id: studentId,
    })
    return
  }

  if (data.startsWith('admin_reject_')) {
    const studentId = parseInt(data.replace('admin_reject_', ''), 10)
    await bot.answerCallbackQuery(query.id).catch(() => {})

    db.prepare("UPDATE students SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      StudentStatus.REJECTED,
      studentId,
    )
    const student = db
    .prepare(
      `
    SELECT s.*, u.telegram_id
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `,
    )
    .get(studentId)

    await bot.sendMessage(chatId, `❌ Заявка ученика ${student.full_name} отклонена.`)
    const rejectMsg = 'К сожалению, ваша заявка была отклонена.'
    await bot.sendMessage(student.telegram_id, rejectMsg)
    createAppNotification(student.user_id, 'student_status', rejectMsg, {
      action: 'reject',
      student_id: studentId,
    })
    return
  }

  if (data.startsWith('teacher_student_')) {
    const studentId = parseInt(data.replace('teacher_student_', ''), 10)
    const homeworks = getHomeworksByStudent(studentId, false)
    if (homeworks.length === 0) {
      await bot.sendMessage(chatId, 'Нет непроверенных заданий у этого ученика.')
      await bot.answerCallbackQuery(query.id)
      return
    }

    for (const hw of homeworks) {
      const lessonText = hw.is_bonus ? 'Дополнительное' : `Урок №${hw.lesson_number}`
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Принять', callback_data: `review_approve_${hw.id}` },
            { text: '💬 Без оценки', callback_data: `review_comment_${hw.id}` },
          ],
        ],
      }

      let message = `📝 ${lessonText}\n`
      if (hw.text_content) {
        message += `Текст: ${hw.text_content}\n`
      }
      if (hw.file_id) {
        message += `Файл: ${hw.content_type}\n`
      }

      if (hw.content_type === 'photo') {
        await bot.sendPhoto(chatId, hw.file_id, { caption: message, reply_markup: keyboard })
      } else if (hw.content_type === 'video') {
        await bot.sendVideo(chatId, hw.file_id, { caption: message, reply_markup: keyboard })
      } else {
        await bot.sendMessage(chatId, message, { reply_markup: keyboard })
      }
    }
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data.startsWith('review_approve_')) {
    const homeworkId = parseInt(data.replace('review_approve_', ''), 10)
    sessions.set(chatId, {
      type: 'review',
      step: ReviewStep.Rating,
      payload: { homeworkId, action: 'approve' },
    })
    await bot.sendMessage(chatId, '⭐ Введите оценку от 1 до 5:')
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data.startsWith('review_reject_')) {
    const homeworkId = parseInt(data.replace('review_reject_', ''), 10)
    sessions.set(chatId, {
      type: 'review',
      step: ReviewStep.Comment,
      payload: { homeworkId, action: 'reject' },
    })
    await bot.sendMessage(chatId, '✏️ Введите комментарий для доработки:')
    await bot.answerCallbackQuery(query.id)
    return
  }

  if (data.startsWith('review_comment_')) {
    const homeworkId = parseInt(data.replace('review_comment_', ''), 10)
    sessions.set(chatId, {
      type: 'review',
      step: ReviewStep.Comment,
      payload: { homeworkId, action: 'comment' },
    })
    await bot.sendMessage(chatId, '💬 Введите комментарий для ученика (задание будет отправлено на доработку):')
    await bot.answerCallbackQuery(query.id)
    return
  }

  await bot.answerCallbackQuery(query.id)
})

bot.on('message', async (msg) => {
  if (msg.text?.startsWith('/')) {
    return
  }

  const session = sessions.get(msg.chat.id)
  if (!session) {
    return
  }

  if (session.type === 'registration') {
    const value = msg.text?.trim()
    if (!value) {
      await bot.sendMessage(msg.chat.id, 'Пожалуйста, отправьте текстовое сообщение.')
      return
    }

    switch (session.step) {
      case RegistrationStep.FullName: {
        session.payload.fullName = value
        session.step = RegistrationStep.Phone
        await bot.sendMessage(
          msg.chat.id,
          '📞 Укажите номер телефона (формат: +79998887766 или 79998887766).',
        )
        break
      }
      case RegistrationStep.Phone: {
        if (!validatePhone(value)) {
          await bot.sendMessage(
            msg.chat.id,
            'Не получилось распознать номер. Попробуйте ещё раз в формате +79998887766.',
          )
          return
        }

        session.payload.phone = value.replace(/\s+/g, '')
        session.step = RegistrationStep.Lessons
        await bot.sendMessage(
          msg.chat.id,
          '📚 Сколько занятий вы хотите? Укажите целое число (например, 10).',
        )
        break
      }
      case RegistrationStep.Lessons: {
        const lessons = parseLessons(value)
        if (!lessons) {
          await bot.sendMessage(
            msg.chat.id,
            'Число занятий должно быть положительным целым числом. Попробуйте ещё раз.',
          )
          return
        }

        const regUser = getOrCreateUser(msg.from.id, msg.from.username, msg.from.first_name, msg.from.last_name)
        if (getStudentByUserId(regUser.id)) {
          await bot.sendMessage(
            msg.chat.id,
            'У вас уже есть заявка или профиль ученика. Повторная регистрация с этого Telegram недоступна.',
          )
          sessions.delete(msg.chat.id)
          return
        }
        try {
          createStudent(regUser.id, session.payload.fullName, session.payload.phone, lessons)
        } catch (err) {
          if (String(err?.code || '') === 'SQLITE_CONSTRAINT_UNIQUE' || String(err?.message || '').includes('UNIQUE')) {
            await bot.sendMessage(
              msg.chat.id,
              'У вас уже есть заявка или профиль ученика. Повторная регистрация с этого Telegram недоступна.',
            )
            sessions.delete(msg.chat.id)
            return
          }
          throw err
        }

        await bot.sendMessage(
          msg.chat.id,
          '🎉 Спасибо! Заявка отправлена и находится на модерации. Мы свяжемся с вами после проверки.',
        )

        const adminNewStudentMsg = `Новый ученик: ${session.payload.fullName}\nТелефон: ${session.payload.phone}\nКоличество занятий: ${lessons}\n\nИспользуйте /admin для модерации.`
        await notifyAdmins(adminNewStudentMsg)
        createAppNotificationsForAdmins('new_student', adminNewStudentMsg, { source: 'bot' })

        sessions.delete(msg.chat.id)
        break
      }
    }
    return
  }

  if (session.type === 'admin') {
    const value = msg.text?.trim()
    if (!value) {
      await bot.sendMessage(msg.chat.id, 'Пожалуйста, отправьте текстовое сообщение с Telegram ID.')
      return
    }

    const telegramId = parseInt(value, 10)
    if (!Number.isInteger(telegramId)) {
      await bot.sendMessage(msg.chat.id, 'Не удалось распознать Telegram ID. Отправьте числовой ID.')
      return
    }

    const targetUser = getUserByTelegramId(telegramId)
    if (!targetUser) {
      await bot.sendMessage(msg.chat.id, 'Пользователь не найден. Попросите его сначала отправить /start боту.')
      sessions.delete(msg.chat.id)
      return
    }

    if (session.step === AdminStep.AssignTeacherById) {
      addUserRole(targetUser.id, UserRole.TEACHER)
      const teacher = getTeacherByUserId(targetUser.id)
      if (!teacher) {
        const teacherName =
          [targetUser.first_name, targetUser.last_name].filter(Boolean).join(' ') ||
          targetUser.username ||
          'Преподаватель'
        createTeacher(targetUser.id, teacherName)
      }
      await bot.sendMessage(msg.chat.id, `✅ Пользователь ${telegramId} назначен преподавателем.`)
      sessions.delete(msg.chat.id)
      return
    }

    if (session.step === AdminStep.RemoveTeacherById) {
      removeUserRole(targetUser.id, UserRole.TEACHER)
      deleteTeacherByUserId(targetUser.id)
      await bot.sendMessage(msg.chat.id, `✅ Преподаватель ${telegramId} удалён.`)
      sessions.delete(msg.chat.id)
      return
    }
  }

  if (session.type === 'homework') {
    const student = getStudentByTelegramId(msg.from.id)
    if (!student) {
      await bot.sendMessage(msg.chat.id, 'Ошибка: студент не найден.')
      sessions.delete(msg.chat.id)
      return
    }

    let contentType = 'text'
    let fileId = null
    let textContent = null

    if (msg.photo && msg.photo.length > 0) {
      contentType = 'photo'
      fileId = msg.photo[msg.photo.length - 1].file_id
    } else if (msg.video) {
      contentType = 'video'
      fileId = msg.video.file_id
    } else if (msg.document) {
      contentType = 'document'
      fileId = msg.document.file_id
    } else if (msg.text) {
      contentType = 'text'
      textContent = msg.text
    } else {
      await bot.sendMessage(msg.chat.id, 'Пожалуйста, отправьте фото, видео или текстовое сообщение.')
      return
    }

    const homeworkId = createHomework(
      student.id,
      session.payload.lessonNumber,
      session.payload.isBonus,
      contentType,
      fileId,
      textContent,
      null,
    )

    const lessonText = session.payload.isBonus
      ? 'дополнительное задание'
      : `урок №${session.payload.lessonNumber}`

    await bot.sendMessage(msg.chat.id, `✅ Домашнее задание по ${lessonText} отправлено на проверку.`)

    const teachers = getTeachersByStudent(student.id)
    const message = `Ученик ${student.full_name} отправил ДЗ по ${lessonText}.`

    for (const teacher of teachers) {
      const keyboard = {
        inline_keyboard: [[{ text: 'Посмотреть', callback_data: `teacher_student_${student.id}` }]],
      }
      await bot.sendMessage(teacher.telegram_id, message, { reply_markup: keyboard })
      if (teacher.user_id) {
        createAppNotification(teacher.user_id, 'new_homework', message, {
          student_id: student.id,
          homework_id: Number(homeworkId),
        })
      }
    }

    await notifyAdmins(message)
    createAppNotificationsForAdmins('new_homework', message, { student_id: student.id, homework_id: Number(homeworkId) })

    sessions.delete(msg.chat.id)
    return
  }

  if (session.type === 'review') {
    const user = getOrCreateUser(msg.from.id, msg.from.username, msg.from.first_name, msg.from.last_name)
    const teacher = db.prepare('SELECT * FROM teachers WHERE user_id = ?').get(user.id)
    if (!teacher) {
      await bot.sendMessage(msg.chat.id, 'Ошибка: преподаватель не найден.')
      sessions.delete(msg.chat.id)
      return
    }

    if (session.step === ReviewStep.Rating) {
      const rating = parseInt(msg.text, 10)
      if (!rating || rating < 1 || rating > 5) {
        await bot.sendMessage(msg.chat.id, 'Оценка должна быть от 1 до 5. Попробуйте ещё раз.')
        return
      }

      session.payload.rating = rating
      session.step = ReviewStep.Comment
      await bot.sendMessage(msg.chat.id, '✏️ Введите комментарий (или отправьте "-" чтобы пропустить):')
      return
    }

    if (session.step === ReviewStep.Comment) {
      const comment = msg.text === '-' ? null : msg.text
      const status = session.payload.action === 'approve' ? 'approved' : 'rejected'

      createHomeworkReview(session.payload.homeworkId, teacher.id, session.payload.rating, comment, status)

      const homework = getHomeworkById(session.payload.homeworkId)
      if (!homework) {
        await bot.sendMessage(msg.chat.id, 'Ошибка: задание не найдено.')
        sessions.delete(msg.chat.id)
        return
      }

      // Подстраховка, если по какой-то причине не вернулся telegram_id
      let studentTelegramId = homework.student_telegram_id
      if (!studentTelegramId) {
        const row = db
          .prepare(
            `
          SELECT u.telegram_id
          FROM students s
          JOIN users u ON s.user_id = u.id
          WHERE s.id = ?
        `,
          )
          .get(homework.student_id)
        studentTelegramId = row?.telegram_id
      }

      if (!studentTelegramId) {
        await bot.sendMessage(msg.chat.id, 'Ошибка: не удалось определить чат ученика.')
        sessions.delete(msg.chat.id)
        return
      }

      const lessonText = homework.is_bonus
        ? 'дополнительное задание'
        : `урок №${homework.lesson_number}`

      if (status === 'approved') {
        const stars = '⭐'.repeat(session.payload.rating || 0)
        await bot.sendMessage(
          studentTelegramId,
          `✅ Твое задание по ${lessonText} проверено.\nОценка: ${stars}\n${comment ? `Комментарий: ${comment}` : ''}`,
        )
        const inAppBody = `Задание по ${lessonText} принято. Оценка: ${session.payload.rating} из 5.${
          comment ? `\nКомментарий: ${comment}` : ''
        }`
        createAppNotification(homework.student_user_id, 'homework_review', inAppBody, {
          homework_id: session.payload.homeworkId,
          status: 'approved',
        })
      } else {
        await bot.sendMessage(
          studentTelegramId,
          `❌ Твое задание по ${lessonText} нужно доработать.\n${comment ? `Комментарий: ${comment}` : ''}`,
        )
        const inAppBody = `Задание по ${lessonText} нужно доработать.${comment ? `\nКомментарий: ${comment}` : ''}`
        createAppNotification(homework.student_user_id, 'homework_review', inAppBody, {
          homework_id: session.payload.homeworkId,
          status: 'revision',
        })
      }

      await bot.sendMessage(msg.chat.id, '✅ Проверка сохранена.')
      sessions.delete(msg.chat.id)
      return
    }
  }
})

console.info('Бот запущен. Ожидаем сообщений...')
