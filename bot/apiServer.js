import http from 'http'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import sharp from 'sharp'
import { Buffer } from 'buffer'
import { createWriteStream, mkdirSync, createReadStream, existsSync, realpathSync, unlinkSync } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { extname, basename, dirname, join, sep } from 'path'
import crypto from 'crypto'
import { z } from 'zod'
import { parseAndValidateTelegramWebAppInitData } from './telegramWebAppAuth.js'
import db from './database.js'
import {
  StudentStatus,
  HomeworkStatus,
  ChatContentType,
  createStudent,
  createHomework,
  insertHomeworkFile,
  getHomeworkById,
  getHomeworkAttachments,
  getHomeworkAttachmentById,
  getHomeworkAttachmentsByHomeworkIds,
  getHomeworksByStudent,
  getPendingHomeworksForTeacher,
  getStudentsWithPendingCount,
  getStudentsByTeacher,
  getAllAdmins,
  createHomeworkReview,
  getOrCreateUser,
  updateUserProfile,
  getStudentByUserId,
  getTeacherByUserId,
  getUserByTelegramId,
  getUserByVkUserId,
  getUserById,
  setUserVkUserId,
  getUserRoles,
  addUserRole,
  UserRole,
  removeUserRole,
  createTeacher,
  deleteTeacherByUserId,
  getAllTeachers,
  getTeacherById,
  getActiveStudents,
  getStudentById,
  assignTeacherToStudent,
  unassignStudentFromTeacher,
  countPendingHomeworksForStudent,
  replaceStudentTeachers,
  updateStudentLessonsAndTrack,
  getStudentsByStatus,
  getAllHomeworks,
  getHomeworkReviews,
  submitStudentHomeworkRevision,
  getTeachersByStudent,
  getStudentRatingStats,
  createAppNotification,
  createAppNotificationsForAdmins,
  markAppNotificationRead,
  markAllAppNotificationsRead,
  getUnreadAppNotificationCount,
  appendAuditLog,
  getAuditLogEntries,
  pruneAppNotifications,
  getChatStudentsForUser,
  canUserAccessStudentChat,
  createChatMessage,
  getChatMessagesByStudent,
  getChatMessageById,
  getAppNotificationsForUser,
  createVkLinkTokenForUser,
  consumeVkLinkToken,
  deleteBareUserCascade,
  getGuestPortfolioStudents,
  getGuestHomeworkSummaries,
  isStudentVisibleOnGuestPortfolio,
  upsertPendingTeacherApplication,
  getPendingTeacherApplications,
  getTeacherApplicationById,
  setTeacherApplicationStatus,
  getPendingHomeworkDuplicateForSlot,
  submitStudentProfileEdit,
  getPendingProfileEdits,
  approveProfileEdit,
  rejectProfileEdit,
  updatePendingHomework,
  updateStudentAvatar,
  updateStudentAbout,
  updateTeacherAbout,
  createHomeworkComment,
  getHomeworkComments,
  createWebLoginRequest,
  approveWebLoginRequest,
  consumeWebLoginRequest,
  getWebLoginRequestState,
  getWebSessionUser,
  deleteWebSession,
} from './dbService.js'

const PORT = Number(process.env.API_PORT || process.env.PORT || 8787)
const BOT_TOKEN =
  process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN
const TELEGRAM_API_URL = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null
const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads')
const MAX_UPLOAD_BYTES = Number(process.env.MAX_HOMEWORK_UPLOAD_MB || 450) * 1024 * 1024
const VK_ID_OFFSET = Number(process.env.VK_ID_OFFSET || 10_000_000_000)
const VK_APP_ID = Number(process.env.VK_APP_ID || 54558405)
const VK_APP_SECRET = process.env.VK_APP_SECRET || ''
const TELEGRAM_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim()
const CHAT_ENABLED = String(process.env.CHAT_ENABLED || 'true').toLowerCase() !== 'false'

mkdirSync(UPLOAD_DIR, { recursive: true })

/**
 * nginx `location /api/ { proxy_pass http://127.0.0.1:8787/; }` отдаёт в Node путь `/session`, а не `/api/session`.
 * Правим req.url до роутинга Fastify. Отключить: API_PREFIX_STRIP_REWRITE=0
 */
const API_PREFIX_STRIP_REWRITE =
  String(process.env.API_PREFIX_STRIP_REWRITE ?? '1').toLowerCase() !== '0'

const serverFactory = (handler) =>
  http.createServer((req, res) => {
    if (API_PREFIX_STRIP_REWRITE && req.url) {
      const q = req.url.indexOf('?')
      const pathOnly = q >= 0 ? req.url.slice(0, q) : req.url
      const qs = q >= 0 ? req.url.slice(q) : ''
      if (pathOnly !== '/' && pathOnly !== '/health' && !pathOnly.startsWith('/api')) {
        req.url = `/api${pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`}${qs}`
      }
    }
    handler(req, res)
  })

const app = Fastify({ logger: false, serverFactory })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'X-Telegram-Init-Data',
    'X-Client-Platform',
    'X-VK-User-Id',
    'X-App-User-Id',
    'X-VK-Launch-Params',
    'X-Web-Session',
  ],
})

await app.register(multipart, {
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 5 },
  throwFileSizeLimit: true,
})

const telegramIdSchema = z.coerce.number().int().positive()

const getVkNumericUserIdFromRequest = (request) => {
  const p = String(request.headers['x-client-platform'] || '').toLowerCase()
  if (p !== 'vk') return null
  const v = Number(request.headers['x-vk-user-id'])
  return Number.isFinite(v) && v > 0 ? v : null
}

/** Для входа из ВК: сначала users.vk_user_id, иначе легаси-строка по синтетическому telegram_id. */
const resolveUserForRequest = (request, telegramIdClaim) => {
  const vkId = getVkNumericUserIdFromRequest(request)
  if (vkId != null) {
    const byVk = getUserByVkUserId(vkId)
    if (byVk) return byVk
  }
  return getUserByTelegramId(telegramIdClaim)
}

const resolveStudentForRequest = (request, telegramIdClaim) => {
  const user = resolveUserForRequest(request, telegramIdClaim)
  return user ? getStudentByUserId(user.id) : null
}

const optionalPositiveIntSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' ? null : Number(v)))
  .refine((v) => v == null || (Number.isInteger(v) && v > 0), 'must be a positive integer')

const parseSchema = (schema, input, reply) => {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    reply.code(400).send({ ok: false, error: 'Некорректные параметры запроса.' })
    return null
  }
  return parsed.data
}

const RAW_TG_AUTH = String(process.env.TG_WEBAPP_AUTH || '').toLowerCase()
const TG_WEBAPP_AUTH_MODE =
  RAW_TG_AUTH === 'off' || RAW_TG_AUTH === 'optional' || RAW_TG_AUTH === 'strict'
    ? RAW_TG_AUTH
    : BOT_TOKEN
      ? 'optional'
      : 'off'

if (BOT_TOKEN && TG_WEBAPP_AUTH_MODE !== 'strict') {
  console.warn(
    '\n⚠️  SECURITY: TG_WEBAPP_AUTH is not "strict" — any request can bypass ' +
      'Telegram auth by omitting X-Telegram-Init-Data. Set TG_WEBAPP_AUTH=strict in production.\n',
  )
}

let lastNotificationPruneAt = 0

const maybePruneOldNotifications = () => {
  const now = Date.now()
  if (now - lastNotificationPruneAt < 3_600_000) return
  lastNotificationPruneAt = now
  try {
    pruneAppNotifications()
  } catch (error) {
    console.error('Очистка уведомлений:', error.message)
  }
}

const contentTypeToMime = (contentType) => {
  if (contentType === 'photo') return 'image/jpeg'
  if (contentType === 'video') return 'video/mp4'
  if (contentType === 'document') return 'application/octet-stream'
  return 'text/plain; charset=utf-8'
}

const mimeToChatContentType = (mimeType) => {
  const mime = String(mimeType || '').toLowerCase()
  if (mime.startsWith('image/')) return ChatContentType.PHOTO
  if (mime.startsWith('video/')) return ChatContentType.VIDEO
  return ChatContentType.DOCUMENT
}

const normalizeUploadedImage = async (fileInfo) => {
  if (!fileInfo?.path) return fileInfo
  const mime = String(fileInfo.mimeType || '').toLowerCase()
  const ext = extname(fileInfo.filename || fileInfo.path).toLowerCase()
  const isImage =
    mime.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext)
  if (!isImage) {
    return fileInfo
  }

  const outputPath = join(dirname(fileInfo.path), `${basename(fileInfo.path, extname(fileInfo.path))}-normalized.jpg`)
  try {
    await sharp(fileInfo.path).rotate().jpeg({ quality: 92, mozjpeg: true }).toFile(outputPath)
    try {
      unlinkSync(fileInfo.path)
    } catch {
      // ignore cleanup errors
    }
    return {
      ...fileInfo,
      path: outputPath,
      filename: `${basename(fileInfo.filename || 'image', ext) || 'image'}.jpg`,
      mimeType: 'image/jpeg',
    }
  } catch {
    if (mime.includes('heic') || mime.includes('heif') || ext === '.heic' || ext === '.heif') {
      throw new Error('UNSUPPORTED_HEIC')
    }
    return fileInfo
  }
}

/** Превью для встраивания в карусель/сетку (`?preview=1`); без параметра — исходный файл с диска. */
const sendHomeworkPhotoPreviewFromDisk = async (reply, diskPath) => {
  try {
    const buf = await sharp(diskPath)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer()
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type('image/jpeg')
    await reply.send(buf)
    return true
  } catch (error) {
    console.error('Превью фото ДЗ:', error.message)
    return false
  }
}

const wantsHomeworkFilePreview = (query) => query?.preview === '1' || query?.preview === 'true'

const resolveSenderLabel = (message) => {
  if (message.content_type === ChatContentType.SYSTEM) {
    return 'Система'
  }
  const fullName = [message.sender_first_name, message.sender_last_name].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  if (message.sender_username) return `@${message.sender_username}`
  if (message.sender_telegram_id) return `ID ${message.sender_telegram_id}`
  if (message.sender_user_id) return `Пользователь ${message.sender_user_id}`
  return 'Пользователь'
}

/** Роль отправителя в чате ученика (как в макете `files_new/barber-academy.html`). */
const resolveSenderChatRole = (message, threadStudentId) => {
  if (message.content_type === ChatContentType.SYSTEM) {
    return { key: 'system', label: 'система', color: 'var(--dim)' }
  }
  const st = getStudentById(threadStudentId)
  if (st && Number(st.user_id) === Number(message.sender_user_id)) {
    return { key: 'student', label: 'ученик', color: 'var(--gold)' }
  }
  const roles = getUserRoles(message.sender_user_id)
  if (roles.includes(UserRole.ADMIN)) {
    return { key: 'admin', label: 'админ', color: 'var(--danger)' }
  }
  if (roles.includes(UserRole.TEACHER)) {
    return { key: 'teacher', label: 'преподаватель', color: 'var(--success)' }
  }
  return { key: 'user', label: 'пользователь', color: 'var(--gold)' }
}

const resolveHomeworkDiskPath = (fileId) => {
  if (!fileId || typeof fileId !== 'string') return null
  if (!existsSync(fileId)) return null
  try {
    const resolvedFile = realpathSync(fileId)
    const resolvedDir = realpathSync(UPLOAD_DIR)
    if (resolvedFile === resolvedDir || resolvedFile.startsWith(resolvedDir + sep)) {
      return resolvedFile
    }
  } catch {
    return null
  }
  return null
}

/** Отдаёт файл аватара ученика. Доступ проверяет вызывающий обработчик. */
const sendStudentAvatar = (reply, student, { cacheScope = 'private' } = {}) => {
  if (!student?.avatar_file_id) return reply.code(404).send({ ok: false, error: 'Аватар не установлен.' })
  const diskPath = resolveHomeworkDiskPath(student.avatar_file_id)
  if (!diskPath) return reply.code(404).send({ ok: false, error: 'Файл аватара не найден.' })

  reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
  reply.header('Cache-Control', `${cacheScope}, max-age=3600`)
  reply.type('image/jpeg')
  return reply.send(createReadStream(diskPath))
}

const isTelegramBotFileId = (fileId) => {
  if (!fileId || typeof fileId !== 'string') return false
  if (existsSync(fileId)) return false
  if (fileId.includes('/') || fileId.includes('\\')) return false
  return fileId.length > 12
}

const pushInAppForTeachersOfStudent = (studentId, kind, body, payload) => {
  const teachers = getTeachersByStudent(studentId)
  for (const t of teachers) {
    if (t.user_id) {
      createAppNotification(t.user_id, kind, body, payload)
    }
  }
}

const canUserAccessHomework = (request, telegramId, homework) => {
  const user = resolveUserForRequest(request, telegramId)
  if (!user) return false
  const roles = getUserRoles(user.id)
  if (roles.includes(UserRole.ADMIN)) return true
  const student = getStudentByUserId(user.id)
  if (student && student.id === homework.student_id) return true
  const teacher = getTeacherByUserId(user.id)
  if (teacher) return getStudentsByTeacher(teacher.id).some((s) => s.id === homework.student_id)
  return false
}

/** Профиль ученика видят он сам, его преподаватели и администратор. */
const canUserViewStudentProfile = (request, telegramId, studentId) => {
  const user = resolveUserForRequest(request, telegramId)
  if (!user) return false
  const roles = getUserRoles(user.id)
  if (roles.includes(UserRole.ADMIN)) return true
  const student = getStudentByUserId(user.id)
  if (student && student.id === studentId) return true
  const teacher = getTeacherByUserId(user.id)
  if (teacher) return getStudentsByTeacher(teacher.id).some((s) => s.id === studentId)
  return false
}

const verifyVkLaunchParams = (raw) => {
  if (!VK_APP_SECRET || !raw) {
    return false
  }
  try {
    const params = new URLSearchParams(raw)
    const sign = params.get('sign')
    if (!sign) {
      return false
    }
    const pairs = []
    for (const [key, value] of params.entries()) {
      if (!key.startsWith('vk_')) continue
      pairs.push(`${key}=${value}`)
    }
    pairs.sort()
    const checkString = pairs.join('&')
    const hmac = crypto
      .createHmac('sha256', VK_APP_SECRET)
      .update(checkString)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    return hmac === sign
  } catch {
    return false
  }
}

const assertTelegramWebAppForClaimedId = (request, reply, claimedTelegramId) => {
  const webSession = String(request.headers['x-web-session'] || '').trim()
  if (webSession) {
    const user = getWebSessionUser(webSession)
    if (!user) {
      reply.code(401).send({ ok: false, error: 'Сессия сайта истекла. Войдите снова.' })
      return false
    }
    if (Number(user.telegram_id) !== Number(claimedTelegramId)) {
      reply.code(403).send({ ok: false, error: 'Сессия сайта не соответствует запрошенному пользователю.' })
      return false
    }
    return true
  }
  const clientPlatform = String(request.headers['x-client-platform'] || '').toLowerCase()
  if (clientPlatform === 'vk') {
    const vkUserIdRaw = request.headers['x-vk-user-id']
    const vkUserId = Number(vkUserIdRaw)
    const appUserIdHeader = Number(request.headers['x-app-user-id'] || 0)
    const vkLaunchParams = String(request.headers['x-vk-launch-params'] || '')
    const claimed = Number(claimedTelegramId)
    if (!Number.isFinite(vkUserId) || vkUserId <= 0) {
      reply.code(401).send({ ok: false, error: 'Некорректный X-VK-User-Id.' })
      return false
    }
    const mappedAppUserId = VK_ID_OFFSET + vkUserId
    if (appUserIdHeader && appUserIdHeader !== mappedAppUserId) {
      reply.code(403).send({ ok: false, error: 'X-App-User-Id не совпадает с VK user id.' })
      return false
    }
    if (claimed !== mappedAppUserId) {
      reply.code(403).send({ ok: false, error: 'telegram_id не совпадает с VK user id.' })
      return false
    }
    if (vkLaunchParams) {
      const launch = new URLSearchParams(vkLaunchParams)
      const launchAppId = Number(launch.get('vk_app_id') || 0)
      if (launchAppId && launchAppId !== VK_APP_ID) {
        reply.code(403).send({ ok: false, error: 'vk_app_id не совпадает с конфигурацией сервера.' })
        return false
      }
    }
    if (!VK_APP_SECRET) {
      reply.code(503).send({ ok: false, error: 'VK авторизация не настроена на сервере.' })
      return false
    }
    if (!verifyVkLaunchParams(vkLaunchParams)) {
      reply.code(401).send({ ok: false, error: 'Недействительная подпись VK launch params.' })
      return false
    }
    return true
  }

  if (TG_WEBAPP_AUTH_MODE === 'off' || !BOT_TOKEN) return true
  const claimed = Number(claimedTelegramId)
  if (!Number.isFinite(claimed)) {
    reply.code(400).send({ ok: false, error: 'Некорректный telegram_id.' })
    return false
  }

  const raw = request.headers['x-telegram-init-data']
  if (!raw || typeof raw !== 'string') {
    if (TG_WEBAPP_AUTH_MODE === 'strict') {
      reply.code(401).send({
        ok: false,
        error:
          'Требуется заголовок X-Telegram-Init-Data. Откройте мини-апп из Telegram или задайте TG_WEBAPP_AUTH=optional для разработки.',
      })
      return false
    }
    return true
  }

  const parsed = parseAndValidateTelegramWebAppInitData(raw.trim(), BOT_TOKEN)
  if (!parsed) {
    reply.code(401).send({ ok: false, error: 'Недействительные или устаревшие данные Telegram (initData).' })
    return false
  }
  if (parsed.telegramUserId !== claimed) {
    reply.code(403).send({ ok: false, error: 'telegram_id не совпадает с подписью Telegram.' })
    return false
  }
  return true
}

const requireAdmin = (request, telegramId) => {
  const user = resolveUserForRequest(request, telegramId)
  if (!user) return { ok: false, status: 404, error: 'Пользователь не найден.' }
  const roles = getUserRoles(user.id)
  if (!roles.includes(UserRole.ADMIN)) return { ok: false, status: 403, error: 'Доступ только для администраторов.' }
  return { ok: true, user }
}

const resolveTeacherScope = (request, telegramId) => {
  const user = resolveUserForRequest(request, telegramId)
  if (!user) return { ok: false, status: 404, error: 'Пользователь не найден.' }
  const roles = getUserRoles(user.id)
  const isAdmin = roles.includes(UserRole.ADMIN)
  const teacher = getTeacherByUserId(user.id)
  if (!teacher && !isAdmin) {
    return { ok: false, status: 403, error: 'Доступ только для преподавателей.' }
  }
  return { ok: true, user, isAdmin, teacher }
}

const validatePhone = (value) => {
  const trimmed = String(value || '').replace(/\s+/g, '')
  if (!/^(\+?\d{10,15})$/.test(trimmed)) return null
  return trimmed
}

const parseLessons = (value) => {
  const normalized = String(value ?? '').replace(',', '.').trim()
  const lessons = Number(normalized)
  if (!Number.isFinite(lessons) || lessons <= 0 || !Number.isInteger(lessons)) return null
  return lessons
}

const notifyAdmins = async (message) => {
  if (!TELEGRAM_API_URL) return
  const admins = getAllAdmins()
  const requests = admins.map(async (admin) => {
    try {
      const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: admin.telegram_id, text: message }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!payload.ok) {
        console.error(`Telegram sendMessage админу ${admin.telegram_id}:`, payload.description || response.status)
      }
    } catch (error) {
      console.error(`Не удалось отправить уведомление админу ${admin.telegram_id}:`, error.message)
    }
  })
  await Promise.allSettled(requests)
}

const notifyUser = async (telegramId, message) => {
  if (!TELEGRAM_API_URL || !telegramId) return
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text: message }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!payload.ok) {
      console.error(`Telegram sendMessage для ${telegramId}:`, payload.description || response.status)
    }
  } catch (error) {
    console.error(`Не удалось отправить уведомление пользователю ${telegramId}:`, error.message)
  }
}

const notifyUsersAllSettled = async (recipients, message) => {
  await Promise.allSettled(recipients.map((id) => notifyUser(id, message)))
}

const streamTelegramFileToReply = async (reply, fileId) => {
  if (!TELEGRAM_API_URL || !BOT_TOKEN) return false
  const metaRes = await fetch(`${TELEGRAM_API_URL}/getFile?file_id=${encodeURIComponent(fileId)}`)
  const metaJson = await metaRes.json().catch(() => ({}))
  if (!metaJson.ok || !metaJson.result?.file_path) return false

  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${metaJson.result.file_path}`
  const fileRes = await fetch(fileUrl)
  if (!fileRes.ok) return false

  reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
  reply.type(fileRes.headers.get('content-type') || 'application/octet-stream')

  if (fileRes.body && typeof Readable.fromWeb === 'function') {
    return reply.send(Readable.fromWeb(fileRes.body))
  }
  const buf = Buffer.from(await fileRes.arrayBuffer())
  return reply.send(buf)
}

const parseMultipart = async (request) => {
  const fields = {}
  let fileInfo = null

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (fileInfo) {
        part.file.resume()
        continue
      }
      const ext = extname(part.filename || '')
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
      const filepath = join(UPLOAD_DIR, safeName)
      const stream = createWriteStream(filepath)
      await pipeline(part.file, stream)
      if (part.file.truncated) {
        throw new Error('FILE_TOO_LARGE')
      }
      fileInfo = {
        path: filepath,
        filename: part.filename || safeName,
        mimeType: part.mimetype || 'application/octet-stream',
      }
      fileInfo = await normalizeUploadedImage(fileInfo)
    } else {
      fields[part.fieldname] = String(part.value ?? '')
    }
  }

  return { fields, file: fileInfo }
}

const parseHomeworkSubmissionMultipart = async (request) => {
  const fields = {}
  const files = []
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const fname = String(part.fieldname || '')
      if (fname !== 'file' && fname !== 'files') {
        part.file.resume()
        continue
      }
      if (files.length >= 5) {
        part.file.resume()
        throw new Error('TOO_MANY_FILES')
      }
      const ext = extname(part.filename || '')
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
      const filepath = join(UPLOAD_DIR, safeName)
      await pipeline(part.file, createWriteStream(filepath))
      if (part.file.truncated) {
        throw new Error('FILE_TOO_LARGE')
      }
      let fileInfo = {
        path: filepath,
        filename: part.filename || safeName,
        mimeType: part.mimetype || 'application/octet-stream',
      }
      fileInfo = await normalizeUploadedImage(fileInfo)
      files.push(fileInfo)
    } else {
      fields[part.fieldname] = String(part.value ?? '')
    }
  }
  return { fields, files }
}

const homeworkFileFlags = (fileId) => ({
  has_local_file: Boolean(resolveHomeworkDiskPath(fileId)),
  has_telegram_file: Boolean(fileId && !resolveHomeworkDiskPath(fileId) && isTelegramBotFileId(fileId)),
})

const mapAttachmentRowsForClient = (rows) =>
  (rows || []).map((a) => ({
    id: a.id,
    content_type: a.content_type,
    ...homeworkFileFlags(a.file_id),
  }))

const homeworkAttachmentsPayload = (attachmentRows) => {
  const attachments = mapAttachmentRowsForClient(attachmentRows)
  return {
    extra_files_count: attachments.length,
    attachments,
  }
}

const mapReviewRow = (r) => ({
  id: r.id,
  teacher_id: r.teacher_id,
  teacher_name: r.teacher_name,
  rating: r.rating,
  comment: r.comment,
  status: r.status,
  created_at: r.created_at,
})

const mapHomeworkForClient = (h, attachmentRows) => {
  const reviews = getHomeworkReviews(h.id)
  const comments = getHomeworkComments(h.id)
  return {
    id: h.id,
    student_id: h.student_id,
    lesson_number: h.lesson_number,
    is_bonus: Boolean(h.is_bonus),
    haircut_name: h.haircut_name || null,
    has_local_file: Boolean(resolveHomeworkDiskPath(h.file_id)),
    has_telegram_file: Boolean(h.file_id && !resolveHomeworkDiskPath(h.file_id) && isTelegramBotFileId(h.file_id)),
    status: h.status,
    content_type: h.content_type,
    file_id: h.file_id,
    text_content: h.text_content,
    review_count: h.review_count,
    created_at: h.created_at,
    revision_student_text: h.revision_student_text ?? null,
    revision_has_local_file: Boolean(
      h.revision_student_file_id && resolveHomeworkDiskPath(h.revision_student_file_id),
    ),
    revision_has_telegram_file: Boolean(
      h.revision_student_file_id &&
        !resolveHomeworkDiskPath(h.revision_student_file_id) &&
        isTelegramBotFileId(h.revision_student_file_id),
    ),
    reviews: reviews.map(mapReviewRow),
    latest_review: reviews.length ? mapReviewRow(reviews[0]) : null,
    comments: comments.map((comment) => ({
      id: comment.id,
      author_user_id: comment.author_user_id,
      author_name: [comment.first_name, comment.last_name].filter(Boolean).join(' ').trim() || comment.username || 'Пользователь',
      author_role: comment.author_role,
      text_content: comment.text_content,
      created_at: comment.created_at,
    })),
    ...homeworkAttachmentsPayload(attachmentRows),
  }
}

app.get('/health', async () => ({ ok: true }))

app.get('/api/homeworks/:id/file', async (request, reply) => {
  const params = parseSchema(z.object({ id: z.coerce.number().int().positive() }), request.params, reply)
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      preview: z.enum(['1', 'true']).optional(),
    }),
    request.query,
    reply,
  )
  if (!params || !query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return

  const homework = getHomeworkById(params.id)
  if (!homework) return reply.code(404).send({ ok: false, error: 'Задание не найдено.' })
  if (!canUserAccessHomework(request, query.telegram_id, homework)) {
    return reply.code(403).send({ ok: false, error: 'Нет доступа к этому файлу.' })
  }

  const diskPath = resolveHomeworkDiskPath(homework.file_id)
  if (diskPath) {
    if (wantsHomeworkFilePreview(query) && homework.content_type === 'photo') {
      const ok = await sendHomeworkPhotoPreviewFromDisk(reply, diskPath)
      if (ok) return
    }
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(contentTypeToMime(homework.content_type))
    return reply.send(createReadStream(diskPath))
  }

  if (homework.file_id && isTelegramBotFileId(homework.file_id)) {
    try {
      const sent = await streamTelegramFileToReply(reply, homework.file_id)
      if (sent) return
    } catch (error) {
      console.error('Ошибка прокси файла Telegram:', error.message)
    }
  }

  return reply.code(404).send({ ok: false, error: 'Вложение недоступно для скачивания.' })
})

app.get('/api/homeworks/:homeworkId/revision/file', async (request, reply) => {
  const params = parseSchema(
    z.object({ homeworkId: z.coerce.number().int().positive() }),
    request.params,
    reply,
  )
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      preview: z.enum(['1', 'true']).optional(),
    }),
    request.query,
    reply,
  )
  if (!params || !query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return

  const homework = getHomeworkById(params.homeworkId)
  if (!homework?.revision_student_file_id) {
    return reply.code(404).send({ ok: false, error: 'Файл исправления не найден.' })
  }
  if (!canUserAccessHomework(request, query.telegram_id, homework)) {
    return reply.code(403).send({ ok: false, error: 'Нет доступа к этому файлу.' })
  }

  const diskPath = resolveHomeworkDiskPath(homework.revision_student_file_id)
  if (diskPath) {
    if (wantsHomeworkFilePreview(query)) {
      const ok = await sendHomeworkPhotoPreviewFromDisk(reply, diskPath)
      if (ok) return
    }
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type('image/jpeg')
    return reply.send(createReadStream(diskPath))
  }

  if (homework.revision_student_file_id && isTelegramBotFileId(homework.revision_student_file_id)) {
    try {
      const sent = await streamTelegramFileToReply(reply, homework.revision_student_file_id)
      if (sent) return
    } catch (error) {
      console.error('Ошибка прокси файла Telegram (revision):', error.message)
    }
  }

  return reply.code(404).send({ ok: false, error: 'Вложение недоступно для скачивания.' })
})

app.get('/api/homeworks/:homeworkId/attachments/:attachmentId/file', async (request, reply) => {
  const params = parseSchema(
    z.object({
      homeworkId: z.coerce.number().int().positive(),
      attachmentId: z.coerce.number().int().positive(),
    }),
    request.params,
    reply,
  )
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      preview: z.enum(['1', 'true']).optional(),
    }),
    request.query,
    reply,
  )
  if (!params || !query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return

  const attachment = getHomeworkAttachmentById(params.attachmentId)
  if (!attachment || attachment.homework_id !== params.homeworkId) {
    return reply.code(404).send({ ok: false, error: 'Вложение не найдено.' })
  }
  const homework = getHomeworkById(params.homeworkId)
  if (!homework) return reply.code(404).send({ ok: false, error: 'Задание не найдено.' })
  if (!canUserAccessHomework(request, query.telegram_id, homework)) {
    return reply.code(403).send({ ok: false, error: 'Нет доступа к этому файлу.' })
  }

  const diskPath = resolveHomeworkDiskPath(attachment.file_id)
  if (diskPath) {
    if (wantsHomeworkFilePreview(query) && attachment.content_type === 'photo') {
      const ok = await sendHomeworkPhotoPreviewFromDisk(reply, diskPath)
      if (ok) return
    }
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(contentTypeToMime(attachment.content_type))
    return reply.send(createReadStream(diskPath))
  }

  if (attachment.file_id && isTelegramBotFileId(attachment.file_id)) {
    try {
      const sent = await streamTelegramFileToReply(reply, attachment.file_id)
      if (sent) return
    } catch (error) {
      console.error('Ошибка прокси файла Telegram (вложение ДЗ):', error.message)
    }
  }

  return reply.code(404).send({ ok: false, error: 'Вложение недоступно для скачивания.' })
})

/** Начало входа с обычного сайта. Сам токен одноразовый и живёт 15 минут. */
app.post('/api/web-auth/start', async (request, reply) => {
  const body = parseSchema(z.object({ provider: z.enum(['telegram', 'vk']) }), request.body ?? {}, reply)
  if (!body) return
  if (body.provider === 'telegram' && !TELEGRAM_BOT_USERNAME) {
    return reply.code(503).send({ ok: false, error: 'Вход через Telegram ещё не настроен на сервере.' })
  }
  if (body.provider === 'vk' && (!VK_APP_ID || !VK_APP_SECRET)) {
    return reply.code(503).send({ ok: false, error: 'Вход через VK ещё не настроен на сервере.' })
  }
  const login = createWebLoginRequest(body.provider)
  const handoffUrl =
    body.provider === 'telegram'
      ? `https://t.me/${encodeURIComponent(TELEGRAM_BOT_USERNAME)}?start=webauth_${login.token}`
      : `https://vk.com/app${VK_APP_ID}?web_login=${encodeURIComponent(login.token)}`
  return { ok: true, data: { token: login.token, handoff_url: handoffUrl, expires_in_seconds: login.expiresInSeconds } }
})

/** Страница сайта опрашивает этот endpoint после перехода в Telegram/VK. */
app.get('/api/web-auth/status', async (request, reply) => {
  const query = parseSchema(z.object({ token: z.string().min(20).max(200) }), request.query, reply)
  if (!query) return
  const state = getWebLoginRequestState(query.token)
  if (state === 'pending') return { ok: true, data: { status: 'pending' } }
  if (state === 'expired') return reply.code(410).send({ ok: false, error: 'Время подтверждения входа истекло. Начните заново.' })
  const session = consumeWebLoginRequest(query.token)
  if (!session) return reply.code(409).send({ ok: false, error: 'Вход уже завершён в другой вкладке.' })
  const user = getUserById(session.userId)
  return { ok: true, data: { status: 'approved', session_token: session.token, telegram_id: user.telegram_id } }
})

/** Подтверждение из VK Mini App: подпись launch-параметров проверяется сервером. */
app.post('/api/web-auth/confirm/vk', async (request, reply) => {
  const token = String(request.query?.token || '').trim()
  const vkUserId = getVkNumericUserIdFromRequest(request)
  const launchParams = String(request.headers['x-vk-launch-params'] || '')
  if (!token || !vkUserId || !VK_APP_SECRET || !verifyVkLaunchParams(launchParams)) {
    return reply.code(401).send({ ok: false, error: 'Не удалось подтвердить вход через VK.' })
  }
  const user = getOrCreateUser(VK_ID_OFFSET + vkUserId, null, null, null, vkUserId)
  if (!approveWebLoginRequest(token, 'vk', user.id)) {
    return reply.code(410).send({ ok: false, error: 'Ссылка для входа недействительна или уже использована.' })
  }
  appendAuditLog(user.id, 'web_login_approved', { provider: 'vk' })
  return { ok: true, data: { approved: true } }
})

app.post('/api/web-auth/logout', async (request, reply) => {
  const token = String(request.headers['x-web-session'] || '').trim()
  if (token) deleteWebSession(token)
  return { ok: true }
})

app.get('/api/web-auth/session', async (request, reply) => {
  const user = getWebSessionUser(String(request.headers['x-web-session'] || '').trim())
  if (!user) return reply.code(401).send({ ok: false, error: 'Сессия сайта истекла. Войдите снова.' })
  return { ok: true, data: { telegram_id: user.telegram_id } }
})

app.get('/api/session', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return

  const user = resolveUserForRequest(request, query.telegram_id)
  const roles = user ? getUserRoles(user.id) : []
  const student = user ? getStudentByUserId(user.id) : null
  const teacher = user ? getTeacherByUserId(user.id) : null
  const ratingStats = student ? getStudentRatingStats(student.id) : { average_rating: null, ratings_count: 0 }
  const unreadNotifications = user ? getUnreadAppNotificationCount(user.id) : 0
  const primaryRole = roles.includes('admin') ? 'admin' : roles.includes('teacher') ? 'teacher' : roles.includes('student') ? 'student' : null

  return {
    ok: true,
    data: {
      hasUser: Boolean(student) || roles.includes('admin') || roles.includes('teacher'),
      role: primaryRole,
      roles,
      isAdmin: roles.includes('admin'),
      isTeacher: roles.includes('teacher'),
      isStudent: Boolean(student),
      isGuest: Boolean(user) && !Boolean(student) && !roles.includes('admin') && !roles.includes('teacher'),
      student: student
        ? {
            id: student.id,
            full_name: student.full_name,
            phone: student.phone,
            lessons_count: student.lessons_count,
            status: student.status,
            student_track: student.student_track || 'student',
            metro: student.metro || null,
            about_me: student.about_me || '',
            has_avatar: Boolean(student.avatar_file_id),
            average_rating: ratingStats.average_rating,
            ratings_count: ratingStats.ratings_count,
            teachers: getTeachersByStudent(student.id).map((t) => ({
              id: t.id,
              full_name:
                String(t.full_name || '')
                  .trim()
                  .replace(/\s+/g, ' ') ||
                [t.first_name, t.last_name].filter(Boolean).join(' ').trim() ||
                'Преподаватель',
            })),
          }
        : null,
      teacher: teacher ? { id: teacher.id, full_name: teacher.full_name, about_me: teacher.about_me || '' } : null,
      unread_notifications_count: unreadNotifications,
      vk_account_linked: Boolean(user?.vk_user_id),
    },
  }
})

app.post('/api/account/vk-link-token', async (request, reply) => {
  const clientPlatform = String(request.headers['x-client-platform'] || '').toLowerCase()
  if (clientPlatform === 'vk') {
    return reply
      .code(403)
      .send({ ok: false, error: 'Код выдаётся только из мини-приложения Telegram.' })
  }
  const body = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.body ?? {}, reply)
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const user = getUserByTelegramId(body.telegram_id)
  if (!user) {
    return reply.code(404).send({ ok: false, error: 'Сначала откройте приложение из Telegram-бота.' })
  }
  const { plain, expires_at } = createVkLinkTokenForUser(user.id)
  try {
    appendAuditLog(user.id, 'vk_link_token_created', {})
  } catch {
    // ignore audit failures
  }
  return { ok: true, data: { token: plain, expires_at } }
})

app.post('/api/account/vk-link-confirm', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      token: z.string().regex(/^[0-9]{4}$/),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const vkId = getVkNumericUserIdFromRequest(request)
  if (vkId == null) {
    return reply.code(403).send({ ok: false, error: 'Подтверждение доступно только из VK.' })
  }

  const targetUserId = consumeVkLinkToken(body.token.trim())
  if (!targetUserId) {
    return reply.code(400).send({
      ok: false,
      error: 'Код недействителен или истёк. Создайте новый код в Telegram.',
    })
  }

  const tu = getUserById(targetUserId)
  if (!tu) {
    return reply.code(500).send({ ok: false, error: 'Не удалось завершить привязку.' })
  }

  if (tu.vk_user_id != null && Number(tu.vk_user_id) === vkId) {
    return { ok: true, data: { linked: true, already: true } }
  }
  if (tu.vk_user_id != null && Number(tu.vk_user_id) !== vkId) {
    return reply.code(409).send({
      ok: false,
      error: 'К этому аккаунту Telegram уже привязан другой профиль VK. Обратитесь к администратору.',
    })
  }

  const existingVk = getUserByVkUserId(vkId)
  if (existingVk && existingVk.id !== tu.id) {
    const del = deleteBareUserCascade(existingVk.id)
    if (!del.ok) {
      return reply.code(409).send({
        ok: false,
        error:
          'С этим аккаунтом VK уже связаны данные (заявка, сообщения или чат). Свяжитесь с администратором для объединения.',
      })
    }
  }

  setUserVkUserId(tu.id, vkId)
  try {
    appendAuditLog(tu.id, 'vk_link_completed', { vk_user_id: vkId })
  } catch {
    // ignore audit failures
  }
  return { ok: true, data: { linked: true } }
})

app.get('/api/notifications', async (request, reply) => {
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      limit: z.coerce.number().int().min(1).max(80).optional().default(40),
    }),
    request.query,
    reply,
  )
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  maybePruneOldNotifications()
  const nu = resolveUserForRequest(request, query.telegram_id)
  if (!nu) {
    return reply.code(404).send({ ok: false, error: 'Пользователь не найден.' })
  }
  return { ok: true, data: getAppNotificationsForUser(nu.id, query.limit) }
})

app.post('/api/notifications/read', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      notification_id: z.coerce.number().int().positive().optional(),
      read_all: z.boolean().optional(),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const user = resolveUserForRequest(request, body.telegram_id)
  if (!user) return reply.code(404).send({ ok: false, error: 'Пользователь не найден.' })
  if (body.read_all) {
    markAllAppNotificationsRead(user.id)
  } else if (body.notification_id != null) {
    markAppNotificationRead(user.id, body.notification_id)
  } else {
    return reply.code(400).send({ ok: false, error: 'Передайте notification_id или read_all: true.' })
  }
  return { ok: true }
})

app.get('/api/chats/students', async (request, reply) => {
  if (!CHAT_ENABLED) return reply.code(503).send({ ok: false, error: 'Чаты временно отключены.' })
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const user = resolveUserForRequest(request, query.telegram_id)
  if (!user) return reply.code(404).send({ ok: false, error: 'Пользователь не найден.' })
  const students = getChatStudentsForUser(user.id).map((student) => ({
    id: student.id,
    full_name: student.full_name,
    status: student.status,
  }))
  return { ok: true, data: { students } }
})

app.get('/api/chats/messages', async (request, reply) => {
  if (!CHAT_ENABLED) return reply.code(503).send({ ok: false, error: 'Чаты временно отключены.' })
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      student_id: z.coerce.number().int().positive(),
      limit: z.coerce.number().int().min(1).max(200).optional().default(80),
    }),
    request.query,
    reply,
  )
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const user = resolveUserForRequest(request, query.telegram_id)
  if (!user) return reply.code(404).send({ ok: false, error: 'Пользователь не найден.' })
  if (!canUserAccessStudentChat(user.id, query.student_id)) {
    return reply.code(403).send({ ok: false, error: 'Нет доступа к чату этого ученика.' })
  }
  const messages = getChatMessagesByStudent(query.student_id, query.limit).map((message) => {
    const role = resolveSenderChatRole(message, query.student_id)
    return {
      id: message.id,
      student_id: message.student_id,
      sender_user_id: message.sender_user_id,
      sender_name: resolveSenderLabel(message),
      sender_role: role.label,
      sender_role_key: role.key,
      sender_role_color: role.color,
      sender_telegram_id: message.sender_telegram_id,
      text_content: message.text_content,
      content_type: message.content_type,
      has_file: Boolean(message.file_id),
      created_at: message.created_at,
    }
  })
  return { ok: true, data: { messages } }
})

app.post('/api/chats/messages', async (request, reply) => {
  if (!CHAT_ENABLED) return reply.code(503).send({ ok: false, error: 'Чаты временно отключены.' })
  try {
    const { fields, file } = await parseMultipart(request)
    const telegramId = Number(fields.telegram_id)
    const studentId = Number(fields.student_id)
    if (!telegramId || !studentId) {
      return reply.code(400).send({ ok: false, error: 'Передайте telegram_id и student_id.' })
    }
    if (!assertTelegramWebAppForClaimedId(request, reply, telegramId)) return
    const user = resolveUserForRequest(request, telegramId)
    if (!user) return reply.code(404).send({ ok: false, error: 'Пользователь не найден.' })
    const senderStudent = getStudentByUserId(user.id)
    if (!canUserAccessStudentChat(user.id, studentId)) {
      return reply.code(403).send({ ok: false, error: 'Нет доступа к чату этого ученика.' })
    }

    const textContent = String(fields.text_content ?? '').trim()
    if (!textContent && !file) {
      return reply.code(400).send({ ok: false, error: 'Добавьте текст или вложение.' })
    }
    const contentType = file ? mimeToChatContentType(file.mimeType) : ChatContentType.TEXT
    const messageId = createChatMessage({
      student_id: studentId,
      sender_user_id: user.id,
      text_content: textContent || null,
      content_type: contentType,
      file_id: file?.path || null,
    })
    const student = getStudentById(studentId)
    if (!student) return reply.code(404).send({ ok: false, error: 'Ученик не найден.' })
    const senderRoles = getUserRoles(user.id)
    if (senderStudent && senderStudent.id === studentId) {
      try {
        const teachers = getTeachersByStudent(studentId)
        for (const teacher of teachers) {
          if (!teacher.user_id) continue
          createAppNotification(
            teacher.user_id,
            'chat_message',
            `В чате ученика ${student.full_name} новое сообщение.`,
            { student_id: studentId, message_id: messageId },
          )
        }
      } catch (notifyError) {
        console.error('Ошибка уведомления преподавателей о новом сообщении чата:', notifyError.message)
      }
    }
    if (!senderStudent && (senderRoles.includes(UserRole.TEACHER) || senderRoles.includes(UserRole.ADMIN))) {
      try {
        createAppNotification(
          student.user_id,
          'chat_message',
          `Новое сообщение в вашем чате от ${senderRoles.includes(UserRole.ADMIN) ? 'администратора' : 'преподавателя'}.`,
          { student_id: studentId, message_id: messageId },
        )
      } catch (notifyError) {
        console.error('Ошибка уведомления ученика о новом сообщении чата:', notifyError.message)
      }
    }

    const message = getChatMessageById(messageId)
    const role = resolveSenderChatRole(message, studentId)
    return {
      ok: true,
      data: {
        message: {
          id: message.id,
          student_id: message.student_id,
          sender_user_id: message.sender_user_id,
          sender_name: resolveSenderLabel(message),
          sender_role: role.label,
          sender_role_key: role.key,
          sender_role_color: role.color,
          sender_telegram_id: message.sender_telegram_id,
          text_content: message.text_content,
          content_type: message.content_type,
          has_file: Boolean(message.file_id),
          created_at: message.created_at,
        },
      },
    }
  } catch (error) {
    console.error('Ошибка отправки сообщения в чат:', error.message)
    if (error.message === 'FILE_TOO_LARGE' || error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({
        ok: false,
        error: `Файл слишком большой. Максимум ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ.`,
      })
    }
    if (error.message === 'UNSUPPORTED_HEIC') {
      return reply.code(415).send({
        ok: false,
        error: 'Формат HEIC/HEIF не поддерживается на сервере. Сохраните фото как JPG/JPEG и повторите.',
      })
    }
    return reply.code(500).send({ ok: false, error: 'Не удалось отправить сообщение.' })
  }
})

app.get('/api/chats/messages/:id/file', async (request, reply) => {
  if (!CHAT_ENABLED) return reply.code(503).send({ ok: false, error: 'Чаты временно отключены.' })
  const params = parseSchema(z.object({ id: z.coerce.number().int().positive() }), request.params, reply)
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!params || !query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const user = resolveUserForRequest(request, query.telegram_id)
  if (!user) return reply.code(404).send({ ok: false, error: 'Пользователь не найден.' })
  const message = getChatMessageById(params.id)
  if (!message) return reply.code(404).send({ ok: false, error: 'Сообщение не найдено.' })
  if (!canUserAccessStudentChat(user.id, message.student_id)) {
    return reply.code(403).send({ ok: false, error: 'Нет доступа к этому вложению.' })
  }
  if (!message.file_id || !['photo', 'video', 'document'].includes(message.content_type)) {
    return reply.code(404).send({ ok: false, error: 'Вложение недоступно.' })
  }

  const diskPath = resolveHomeworkDiskPath(message.file_id)
  if (diskPath) {
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(contentTypeToMime(message.content_type))
    return reply.send(createReadStream(diskPath))
  }

  if (isTelegramBotFileId(message.file_id)) {
    try {
      const sent = await streamTelegramFileToReply(reply, message.file_id)
      if (sent) return
    } catch (error) {
      console.error('Ошибка прокси файла Telegram (chat):', error.message)
    }
  }

  return reply.code(404).send({ ok: false, error: 'Вложение недоступно.' })
})

app.get('/api/student/homeworks', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const student = resolveStudentForRequest(request, query.telegram_id)
  if (!student) return reply.code(404).send({ ok: false, error: 'Ученик не найден.' })

  const stats = getStudentRatingStats(student.id)
  const rows = getHomeworksByStudent(student.id, true)
  const attMap = getHomeworkAttachmentsByHomeworkIds(rows.map((h) => h.id))
  const homeworks = rows.map((h) => mapHomeworkForClient(h, attMap.get(h.id)))
  return { ok: true, data: { homeworks, average_rating: stats.average_rating, ratings_count: stats.ratings_count } }
})

const pickRandomShowcaseItems = (items, count) => {
  if (!Array.isArray(items) || items.length === 0 || count <= 0) return []
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = a
  }
  return shuffled.slice(0, count)
}

/** Публичное гостевое портфолио. Ответ намеренно содержит только безопасный белый список полей. */
app.get('/api/guest/portfolio-students', async (request, reply) => {
  const rows = getGuestPortfolioStudents()
  const students = rows.map((s) => {
    const stats = getStudentRatingStats(s.id)
    const works = getGuestHomeworkSummaries(s.id)
    return {
      id: s.id,
      full_name: s.full_name,
      lessons_count: s.lessons_count,
      student_track: s.student_track || 'student',
      metro: s.metro || null,
      average_rating: stats.average_rating,
      works_count: works.length,
      has_avatar: Boolean(s.avatar_file_id),
    }
  })
  return { ok: true, data: { students } }
})

app.get('/api/guest/students/:student_id/portfolio', async (request, reply) => {
  const params = parseSchema(z.object({ student_id: z.coerce.number().int().positive() }), request.params, reply)
  if (!params) return
  if (!isStudentVisibleOnGuestPortfolio(params.student_id)) {
    return reply.code(404).send({ ok: false, error: 'Профиль недоступен.' })
  }
  const student = getStudentById(params.student_id)
  if (!student) return reply.code(404).send({ ok: false, error: 'Ученик не найден.' })
  const stats = getStudentRatingStats(student.id)
  const teachers = getTeachersByStudent(student.id).map((t) => ({
    id: t.id,
    full_name: String(t.full_name || '').trim() || [t.first_name, t.last_name].filter(Boolean).join(' ').trim(),
  }))
  const rawHomeworks = getGuestHomeworkSummaries(student.id)
  const attMap = getHomeworkAttachmentsByHomeworkIds(rawHomeworks.map((h) => h.id))
  const homeworks = rawHomeworks.map((h) => {
    const row = getHomeworkById(h.id)
    return {
      ...h,
      has_local_file: row ? Boolean(resolveHomeworkDiskPath(row.file_id)) : false,
      has_telegram_file: row
        ? Boolean(row.file_id && !resolveHomeworkDiskPath(row.file_id) && isTelegramBotFileId(row.file_id))
        : false,
      ...homeworkAttachmentsPayload(attMap.get(h.id)),
    }
  })
  return {
    ok: true,
    data: {
      student: {
        id: student.id,
        full_name: student.full_name,
        lessons_count: student.lessons_count,
        student_track: student.student_track || 'student',
        metro: student.metro || null,
        about_me: student.about_me || '',
        average_rating: stats.average_rating,
        ratings_count: stats.ratings_count,
        has_avatar: Boolean(student.avatar_file_id),
        teachers,
      },
      homeworks,
    },
  }
})

/** Аватар ученика в публичном портфолио: только для профилей, которые уже показаны гостю. */
app.get('/api/guest/students/:student_id/avatar', async (request, reply) => {
  const params = parseSchema(z.object({ student_id: z.coerce.number().int().positive() }), request.params, reply)
  if (!params) return
  if (!isStudentVisibleOnGuestPortfolio(params.student_id)) {
    return reply.code(404).send({ ok: false, error: 'Профиль недоступен.' })
  }

  return sendStudentAvatar(reply, getStudentById(params.student_id), { cacheScope: 'public' })
})

app.get('/api/guest/homeworks/:id/file', async (request, reply) => {
  const params = parseSchema(z.object({ id: z.coerce.number().int().positive() }), request.params, reply)
  const query = parseSchema(
    z.object({
      preview: z.enum(['1', 'true']).optional(),
    }),
    request.query,
    reply,
  )
  if (!params || !query) return
  const homework = getHomeworkById(params.id)
  if (!homework || !isStudentVisibleOnGuestPortfolio(homework.student_id)) {
    return reply.code(404).send({ ok: false, error: 'Работа не найдена.' })
  }
  const diskPath = resolveHomeworkDiskPath(homework.file_id)
  if (diskPath) {
    if (wantsHomeworkFilePreview(query) && homework.content_type === 'photo') {
      const ok = await sendHomeworkPhotoPreviewFromDisk(reply, diskPath)
      if (ok) return
    }
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(contentTypeToMime(homework.content_type))
    return reply.send(createReadStream(diskPath))
  }
  if (homework.file_id && isTelegramBotFileId(homework.file_id)) {
    try {
      const sent = await streamTelegramFileToReply(reply, homework.file_id)
      if (sent) return
    } catch (error) {
      console.error('Ошибка прокси файла Telegram (guest):', error.message)
    }
  }
  return reply.code(404).send({ ok: false, error: 'Вложение недоступно для скачивания.' })
})

app.get('/api/guest/homeworks/:homeworkId/attachments/:attachmentId/file', async (request, reply) => {
  const params = parseSchema(
    z.object({
      homeworkId: z.coerce.number().int().positive(),
      attachmentId: z.coerce.number().int().positive(),
    }),
    request.params,
    reply,
  )
  const query = parseSchema(
    z.object({
      preview: z.enum(['1', 'true']).optional(),
    }),
    request.query,
    reply,
  )
  if (!params || !query) return

  const attachment = getHomeworkAttachmentById(params.attachmentId)
  if (!attachment || attachment.homework_id !== params.homeworkId) {
    return reply.code(404).send({ ok: false, error: 'Вложение не найдено.' })
  }
  const homework = getHomeworkById(params.homeworkId)
  if (!homework || !isStudentVisibleOnGuestPortfolio(homework.student_id)) {
    return reply.code(404).send({ ok: false, error: 'Работа не найдена.' })
  }

  const diskPath = resolveHomeworkDiskPath(attachment.file_id)
  if (diskPath) {
    if (wantsHomeworkFilePreview(query) && attachment.content_type === 'photo') {
      const ok = await sendHomeworkPhotoPreviewFromDisk(reply, diskPath)
      if (ok) return
    }
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(contentTypeToMime(attachment.content_type))
    return reply.send(createReadStream(diskPath))
  }
  if (attachment.file_id && isTelegramBotFileId(attachment.file_id)) {
    try {
      const sent = await streamTelegramFileToReply(reply, attachment.file_id)
      if (sent) return
    } catch (error) {
      console.error('Ошибка прокси файла Telegram (guest вложение):', error.message)
    }
  }
  return reply.code(404).send({ ok: false, error: 'Вложение недоступно для скачивания.' })
})

/** Случайные одобренные работы для витрины */
app.get('/api/showcase/homeworks', async (request, reply) => {
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      limit: z.coerce.number().int().min(1).max(12).optional().default(3),
      exclude_ids: z.string().optional().default(''),
    }),
    request.query,
    reply,
  )
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return

  const excludedIds = new Set(
    String(query.exclude_ids || '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0),
  )

  const approved = getAllHomeworks()
    .filter((hw) => hw.status === HomeworkStatus.APPROVED)
    .filter((hw) => ['photo', 'video'].includes(hw.content_type))
    .filter((hw) => Boolean(resolveHomeworkDiskPath(hw.file_id) || (hw.file_id && isTelegramBotFileId(hw.file_id))))

  const uniqueByStudentAndFile = new Map()
  for (const hw of approved) {
    const key = `${hw.student_id}:${hw.file_id || ''}`
    if (!uniqueByStudentAndFile.has(key)) {
      uniqueByStudentAndFile.set(key, hw)
    }
  }
  const pool = [...uniqueByStudentAndFile.values()]
  const unseenPool = pool.filter((hw) => !excludedIds.has(hw.id))
  let selected = pickRandomShowcaseItems(unseenPool, query.limit)
  let cycled = false

  if (selected.length < query.limit) {
    cycled = true
    const selectedIds = new Set(selected.map((hw) => hw.id))
    const fallbackPool = pool.filter((hw) => !selectedIds.has(hw.id))
    selected.push(...pickRandomShowcaseItems(fallbackPool, query.limit - selected.length))
  }

  return {
    ok: true,
    data: {
      cycled,
      homeworks: selected.map((hw) => ({
        id: hw.id,
        student_name: hw.student_name,
        haircut_name: hw.haircut_name || null,
        content_type: hw.content_type,
        created_at: hw.created_at,
      })),
    },
  }
})

app.get('/api/showcase/homeworks/:id/file', async (request, reply) => {
  const params = parseSchema(z.object({ id: z.coerce.number().int().positive() }), request.params, reply)
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!params || !query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const homework = getHomeworkById(params.id)
  if (!homework || homework.status !== HomeworkStatus.APPROVED) {
    return reply.code(404).send({ ok: false, error: 'Работа не найдена.' })
  }
  if (!['photo', 'video'].includes(homework.content_type)) {
    return reply.code(404).send({ ok: false, error: 'Файл для предпросмотра недоступен.' })
  }

  const diskPath = resolveHomeworkDiskPath(homework.file_id)
  if (diskPath) {
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(contentTypeToMime(homework.content_type))
    return reply.send(createReadStream(diskPath))
  }

  if (homework.file_id && isTelegramBotFileId(homework.file_id)) {
    try {
      const sent = await streamTelegramFileToReply(reply, homework.file_id)
      if (sent) return
    } catch (error) {
      console.error('Ошибка прокси файла Telegram (showcase):', error.message)
    }
  }

  return reply.code(404).send({ ok: false, error: 'Вложение недоступно для скачивания.' })
})

app.get('/api/admin/teacher-applications', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const adminCheck = requireAdmin(request, query.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })
  const applications = getPendingTeacherApplications().map((a) => ({
    id: a.id,
    full_name: a.full_name,
    phone: a.phone,
    telegram_id: a.telegram_id,
    created_at: a.created_at,
  }))
  return { ok: true, data: { applications } }
})

app.post('/api/admin/teacher-applications', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      application_id: z.coerce.number().int().positive(),
      action: z.enum(['approve', 'reject']),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const adminCheck = requireAdmin(request, body.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const row = getTeacherApplicationById(body.application_id)
  if (!row || row.status !== 'pending') {
    return reply.code(404).send({ ok: false, error: 'Заявка не найдена или уже обработана.' })
  }

  const applicant = getUserById(row.applicant_user_id)
  if (!applicant) {
    return reply.code(400).send({ ok: false, error: 'Пользователь заявки не найден.' })
  }

  if (body.action === 'reject') {
    setTeacherApplicationStatus(row.id, 'rejected')
    try {
      appendAuditLog(adminCheck.user.id, 'teacher_application_rejected', { application_id: row.id })
    } catch {
      // ignore
    }
    return { ok: true, data: { status: 'rejected' } }
  }

  const existingTeacher = getTeacherByUserId(applicant.id)
  if (existingTeacher) {
    setTeacherApplicationStatus(row.id, 'approved')
    return { ok: true, data: { status: 'approved', already_teacher: true } }
  }

  addUserRole(applicant.id, UserRole.TEACHER)
  createTeacher(applicant.id, row.full_name)
  setTeacherApplicationStatus(row.id, 'approved')
  try {
    appendAuditLog(adminCheck.user.id, 'teacher_application_approved', {
      application_id: row.id,
      user_id: applicant.id,
    })
  } catch {
    // ignore
  }

  const notifyText = `Ваша заявка на роль преподавателя одобрена. Откройте мини-приложение снова — доступ «Преподаватель» должен появиться после проверки сессии.`
  notifyUser(applicant.telegram_id, notifyText).catch(() => {})
  createAppNotification(applicant.id, 'teacher_application_result', notifyText, { application_id: row.id })

  return { ok: true, data: { status: 'approved' } }
})

app.post('/api/student/feedback', async (request, reply) => {
  const body = parseSchema(z.object({ telegram_id:telegramIdSchema, subject:z.enum(['teacher','academy','other']), message:z.string().trim().min(1).max(4000), request_key:z.string().uuid() }), request.body ?? {}, reply)
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const user = resolveUserForRequest(request, body.telegram_id)
  const student = user ? getStudentByUserId(user.id) : null
  if (!student) return reply.code(403).send({ ok:false, error:'Обратная связь доступна только ученику.' })
  db.prepare('INSERT OR IGNORE INTO private_feedback (student_id,request_key,subject,message) VALUES (?,?,?,?)').run(student.id, body.request_key, body.subject, body.message)
  return { ok:true }
})

app.get('/api/admin/feedback', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id:telegramIdSchema, before:z.coerce.number().int().positive().optional() }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const admin = requireAdmin(request, query.telegram_id)
  if (!admin.ok) return reply.code(admin.status).send({ ok:false, error:admin.error })
  const items = db.prepare(`SELECT f.id,f.subject,f.message,f.created_at,s.full_name FROM private_feedback f JOIN students s ON s.id=f.student_id
    WHERE f.id < ? ORDER BY f.id DESC LIMIT 51`).all(query.before || Number.MAX_SAFE_INTEGER)
  return { ok:true, data:{ items:items.slice(0,50), next:items.length > 50 ? items[49].id : null } }
})

app.post('/api/student/about', async (request, reply) => {
  const body = parseSchema(z.object({ telegram_id: telegramIdSchema, about_me: z.string().max(1000) }), request.body ?? {}, reply)
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const user = resolveUserForRequest(request, body.telegram_id)
  const student = user ? getStudentByUserId(user.id) : null
  if (!student) return reply.code(403).send({ ok: false, error: 'Только ученик может изменить раздел «Обо мне».' })
  updateStudentAbout(student.id, body.about_me.trim())
  return { ok: true }
})

app.post('/api/teacher/about', async (request, reply) => {
  const body = parseSchema(z.object({ telegram_id: telegramIdSchema, about_me: z.string().max(1000) }), request.body ?? {}, reply)
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const user = resolveUserForRequest(request, body.telegram_id)
  const teacher = user ? getTeacherByUserId(user.id) : null
  if (!teacher) return reply.code(403).send({ ok: false, error: 'Только преподаватель может изменить раздел «Обо мне».' })
  updateTeacherAbout(teacher.id, body.about_me.trim())
  return { ok: true }
})

app.post('/api/student/profile-edit', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      full_name: z.string().min(2).max(120),
      phone: z.string().min(5).max(30),
      metro: z.string().max(80).optional(),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const user = resolveUserForRequest(request, body.telegram_id)
  if (!user) return reply.code(404).send({ ok: false, error: 'Пользователь не найден.' })
  const student = getStudentByUserId(user.id)
  if (!student) return reply.code(403).send({ ok: false, error: 'Только ученики могут редактировать профиль.' })
  if (!['studying', 'completed'].includes(student.status)) {
    return reply.code(403).send({ ok: false, error: 'Редактирование профиля недоступно в текущем статусе.' })
  }

  submitStudentProfileEdit(student.id, {
    full_name: body.full_name,
    phone: body.phone,
    metro: body.metro || null,
  })

  try {
    appendAuditLog(user.id, 'student_profile_edit_submitted', { student_id: student.id })
    const admins = getAllAdmins()
    for (const admin of admins) {
      const notifyText = `Ученик ${student.full_name} отправил заявку на изменение профиля.`
      createAppNotification(admin.id, 'profile_edit_pending', notifyText, { student_id: student.id })
      notifyUser(admin.telegram_id, notifyText).catch(() => {})
    }
  } catch {
    // ignore
  }

  return reply.send({ ok: true })
})

app.post('/api/student/me/avatar', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const user = resolveUserForRequest(request, query.telegram_id)
  if (!user) return reply.code(404).send({ ok: false, error: 'Пользователь не найден.' })
  const student = getStudentByUserId(user.id)
  if (!student) return reply.code(403).send({ ok: false, error: 'Только ученики могут менять аватар.' })

  let fileInfo = null
  try {
    const { file } = await parseMultipart(request)
    fileInfo = file
  } catch (err) {
    if (fileInfo?.path && existsSync(fileInfo.path)) unlinkSync(fileInfo.path)
    return reply.code(400).send({ ok: false, error: err.message === 'FILE_TOO_LARGE' ? 'Файл слишком большой.' : 'Ошибка загрузки файла.' })
  }

  if (!fileInfo?.path) return reply.code(400).send({ ok: false, error: 'Файл не получен.' })

  try {
    const avatarPath = join(UPLOAD_DIR, `avatar-${student.id}-${Date.now()}.jpg`)
    await sharp(fileInfo.path).rotate().resize(400, 400, { fit: 'cover' }).jpeg({ quality: 88, mozjpeg: true }).toFile(avatarPath)
    unlinkSync(fileInfo.path)

    if (student.avatar_file_id && existsSync(student.avatar_file_id)) {
      try { unlinkSync(student.avatar_file_id) } catch {}
    }

    updateStudentAvatar(student.id, avatarPath)
    return reply.send({ ok: true })
  } catch (err) {
    if (fileInfo?.path && existsSync(fileInfo.path)) try { unlinkSync(fileInfo.path) } catch {}
    return reply.code(500).send({ ok: false, error: 'Ошибка обработки изображения.' })
  }
})

app.get('/api/student/me/avatar', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const user = resolveUserForRequest(request, query.telegram_id)
  if (!user) return reply.code(404).send({ ok: false, error: 'Пользователь не найден.' })
  const student = getStudentByUserId(user.id)
  return sendStudentAvatar(reply, student)
})

/** Аватар ученика для преподавателя и администратора; ученик тоже может открыть свой по этому адресу. */
app.get('/api/students/:student_id/avatar', async (request, reply) => {
  const params = parseSchema(z.object({ student_id: z.coerce.number().int().positive() }), request.params ?? {}, reply)
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!params || !query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  if (!canUserViewStudentProfile(request, query.telegram_id, params.student_id)) {
    return reply.code(403).send({ ok: false, error: 'Нет доступа к профилю ученика.' })
  }

  return sendStudentAvatar(reply, getStudentById(params.student_id))
})

app.get('/api/admin/profile-edits', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const adminCheck = requireAdmin(request, query.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  return reply.send({ ok: true, data: { edits: getPendingProfileEdits() } })
})

app.post('/api/admin/profile-edits/:id', async (request, reply) => {
  const params = parseSchema(z.object({ id: z.coerce.number().int().positive() }), request.params, reply)
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      action: z.enum(['approve', 'reject']),
      comment: z.string().max(500).optional(),
    }),
    request.body ?? {},
    reply,
  )
  if (!params || !body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const adminCheck = requireAdmin(request, body.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const adminTelegramId = Number(body.telegram_id)

  try {
    if (body.action === 'approve') {
      approveProfileEdit(params.id, adminTelegramId)
    } else {
      rejectProfileEdit(params.id, adminTelegramId, body.comment || null)
    }
  } catch (e) {
    return reply.code(400).send({ ok: false, error: e.message })
  }

  try {
    const edits = getPendingProfileEdits()
    const editRow = edits.find((e) => e.id === params.id)
    const studentId = editRow?.student_id
    const student = studentId ? getStudentById(studentId) : null
    if (student) {
      const studentUser = getUserById(student.user_id)
      if (studentUser) {
        const notifyText =
          body.action === 'approve'
            ? 'Ваша заявка на изменение профиля одобрена. Обновите страницу.'
            : `Ваша заявка на изменение профиля отклонена.${body.comment ? ` Причина: ${body.comment}` : ''}`
        createAppNotification(studentUser.id, `profile_edit_${body.action}d`, notifyText, { edit_id: params.id })
        notifyUser(studentUser.telegram_id, notifyText).catch(() => {})
      }
    }
    appendAuditLog(adminCheck.user.id, `profile_edit_${body.action}d`, { edit_id: params.id })
  } catch {
    // ignore
  }

  return reply.send({ ok: true })
})

app.get('/api/admin/teachers', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const adminCheck = requireAdmin(request, query.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const teachers = getAllTeachers().map((teacher) => {
    const students = getStudentsByTeacher(teacher.id).map((student) => ({
      id: student.id,
      full_name: student.full_name,
      telegram_id: student.telegram_id,
      username: student.username,
    }))
    return {
      id: teacher.id,
      user_id: teacher.user_id,
      full_name: teacher.full_name,
      phone: teacher.phone || null,
      telegram_id: teacher.telegram_id,
      username: teacher.username,
      students_count: students.length,
      students,
    }
  })
  return { ok: true, data: { teachers } }
})

app.get('/api/admin/students', async (request, reply) => {
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      status: z.enum(['studying', 'completed', 'moderation', 'rejected']).optional().default('studying'),
    }),
    request.query,
    reply,
  )
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const adminCheck = requireAdmin(request, query.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const source = query.status === 'moderation' || query.status === 'rejected' ? getStudentsByStatus(query.status) : getActiveStudents()
  const students = source.map((student) => {
    const teachers = getTeachersByStudent(student.id).map((t) => ({
      id: t.id,
      full_name: String(t.full_name || '')
        .trim()
        .replace(/\s+/g, ' ') ||
        [t.first_name, t.last_name].filter(Boolean).join(' ').trim(),
    }))
    const ratingStats = getStudentRatingStats(student.id)
    return {
      id: student.id,
      user_id: student.user_id,
      full_name: student.full_name,
      phone: student.phone,
      telegram_id: student.telegram_id,
      username: student.username,
      first_name: student.first_name,
      last_name: student.last_name,
      lessons_count: student.lessons_count,
      status: student.status,
      student_track: student.student_track || 'student',
      teachers,
      teacher_ids: teachers.map((t) => t.id),
      average_rating: ratingStats.average_rating,
      ratings_count: ratingStats.ratings_count,
      pending_homeworks_count: countPendingHomeworksForStudent(student.id),
      has_avatar: Boolean(student.avatar_file_id),
    }
  })
  return { ok: true, data: { students } }
})

app.get('/api/admin/student/:student_id', async (request, reply) => {
  const params = parseSchema(
    z.object({ student_id: z.coerce.number().int().positive() }),
    request.params ?? {},
    reply,
  )
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!params || !query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const adminCheck = requireAdmin(request, query.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const row = getStudentById(params.student_id)
  if (!row) return reply.code(404).send({ ok: false, error: 'Ученик не найден.' })

  const ratingStats = getStudentRatingStats(row.id)
  const teachers = getTeachersByStudent(row.id).map((t) => ({
    id: t.id,
    full_name: String(t.full_name || '')
      .trim()
      .replace(/\s+/g, ' ') ||
      [t.first_name, t.last_name].filter(Boolean).join(' ').trim(),
  }))
  const hwRows = getHomeworksByStudent(row.id, true)
  const attMap = getHomeworkAttachmentsByHomeworkIds(hwRows.map((h) => h.id))
  const homeworks = hwRows.map((h) => mapHomeworkForClient(h, attMap.get(h.id)))

  return {
    ok: true,
    data: {
      student: {
        id: row.id,
        user_id: row.user_id,
        full_name: row.full_name,
        phone: row.phone,
        telegram_id: row.telegram_id,
        username: row.username,
        first_name: row.first_name,
        last_name: row.last_name,
        lessons_count: row.lessons_count,
        status: row.status,
        student_track: row.student_track || 'student',
        metro: row.metro || null,
        about_me: row.about_me || '',
        teachers,
        teacher_ids: teachers.map((t) => t.id),
        average_rating: ratingStats.average_rating,
        ratings_count: ratingStats.ratings_count,
        pending_homeworks_count: countPendingHomeworksForStudent(row.id),
        has_avatar: Boolean(row.avatar_file_id),
      },
      homeworks,
    },
  }
})

app.post('/api/admin/update-student', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      student_id: z.coerce.number().int().positive(),
      lessons_count: z.coerce.number().int().min(0).optional(),
      student_track: z.enum(['student', 'intern', 'barber']).optional(),
      teacher_ids: z.array(z.coerce.number().int().positive()).optional(),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const adminCheck = requireAdmin(request, body.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const studentRow = getStudentById(body.student_id)
  if (!studentRow) return reply.code(404).send({ ok: false, error: 'Ученик не найден.' })

  if (body.lessons_count != null || body.student_track != null) {
    try {
      updateStudentLessonsAndTrack(body.student_id, {
        lessons_count: body.lessons_count,
        student_track: body.student_track,
      })
    } catch (err) {
      return reply.code(400).send({ ok: false, error: err?.message || 'Некорректные данные.' })
    }
  }

  if (body.teacher_ids != null) {
    if (![StudentStatus.STUDYING, StudentStatus.COMPLETED].includes(studentRow.status)) {
      return reply
        .code(400)
        .send({ ok: false, error: 'Назначать преподавателей можно только при статусе «обучается» или «завершил».' })
    }
    for (const tid of body.teacher_ids) {
      if (!getTeacherById(tid)) {
        return reply.code(400).send({ ok: false, error: `Преподаватель с id ${tid} не найден.` })
      }
    }
    replaceStudentTeachers(body.student_id, body.teacher_ids)
  }

  appendAuditLog(adminCheck.user.id, 'admin_update_student', {
    student_id: body.student_id,
    lessons_count: body.lessons_count ?? null,
    student_track: body.student_track ?? null,
    teacher_ids: body.teacher_ids ?? null,
  })

  return { ok: true }
})

app.post('/api/admin/students', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      student_id: z.coerce.number().int().positive(),
      action: z.enum(['approve', 'reject', 'set_studying', 'set_completed']),
      teacher_ids: z.array(z.coerce.number().int().positive()).max(80).optional(),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const adminCheck = requireAdmin(request, body.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const student = getStudentById(body.student_id)
  if (!student) return reply.code(404).send({ ok: false, error: 'Ученик не найден.' })

  if (body.action === 'approve' && body.teacher_ids != null && body.teacher_ids.length) {
    const uniq = [...new Set(body.teacher_ids)]
    for (const tid of uniq) {
      const trow = getTeacherById(tid)
      if (!trow) {
        return reply.code(400).send({ ok: false, error: `Преподаватель с id ${tid} не найден.` })
      }
    }
    replaceStudentTeachers(body.student_id, uniq)
  }

  const nextStatus =
    body.action === 'approve' || body.action === 'set_studying'
      ? StudentStatus.STUDYING
      : body.action === 'set_completed'
        ? StudentStatus.COMPLETED
        : StudentStatus.REJECTED
  db.prepare("UPDATE students SET status = ?, updated_at = datetime('now') WHERE id = ?").run(nextStatus, body.student_id)
  appendAuditLog(
    adminCheck.user.id,
    body.action === 'approve'
      ? 'admin_student_approve'
      : body.action === 'reject'
        ? 'admin_student_reject'
        : body.action === 'set_completed'
          ? 'admin_student_set_completed'
          : 'admin_student_set_studying',
    {
      student_id: body.student_id,
      status: nextStatus,
    },
  )

  const message =
    body.action === 'approve'
      ? '🎉 Ваша заявка одобрена! Теперь вы можете сдавать домашние задания.'
      : body.action === 'set_completed'
        ? 'Ваш статус обучения обновлен: завершил обучение.'
        : body.action === 'set_studying'
          ? 'Ваш статус обучения обновлен: обучается.'
      : 'К сожалению, ваша заявка была отклонена.'
  await notifyUser(student.telegram_id, message)
  createAppNotification(student.user_id, 'student_status', message, { action: body.action, student_id: body.student_id })
  return { ok: true }
})

app.get('/api/admin/homeworks', async (request, reply) => {
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      student_id: optionalPositiveIntSchema.optional().default(null),
    }),
    request.query,
    reply,
  )
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const adminCheck = requireAdmin(request, query.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const homeworkRows = query.student_id ? getHomeworksByStudent(query.student_id, true) : getAllHomeworks()
  const attMap = getHomeworkAttachmentsByHomeworkIds(homeworkRows.map((hw) => hw.id))
  const payload = homeworkRows.map((hw) => ({
    id: hw.id,
    student_id: hw.student_id,
    student_name: hw.student_name,
    lesson_number: hw.lesson_number,
    is_bonus: Boolean(hw.is_bonus),
    haircut_name: hw.haircut_name || null,
    has_local_file: Boolean(resolveHomeworkDiskPath(hw.file_id)),
    has_telegram_file: Boolean(hw.file_id && !resolveHomeworkDiskPath(hw.file_id) && isTelegramBotFileId(hw.file_id)),
    status: hw.status,
    content_type: hw.content_type,
    file_id: hw.file_id,
    text_content: hw.text_content,
    created_at: hw.created_at,
    ...homeworkAttachmentsPayload(attMap.get(hw.id)),
    reviews: getHomeworkReviews(hw.id).map((review) => ({
      id: review.id,
      teacher_id: review.teacher_id,
      teacher_name: review.teacher_name,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      created_at: review.created_at,
    })),
  }))
  return { ok: true, data: { homeworks: payload } }
})

app.get('/api/admin/audit', async (request, reply) => {
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      limit: z.coerce.number().int().min(1).max(200).optional().default(80),
    }),
    request.query,
    reply,
  )
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return
  const adminCheck = requireAdmin(request, query.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })
  return { ok: true, data: { entries: getAuditLogEntries(query.limit) } }
})

app.post('/api/admin/teachers', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      target_telegram_id: telegramIdSchema,
      action: z.enum(['assign', 'remove']),
      full_name: z.string().optional(),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const adminCheck = requireAdmin(request, body.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const targetUser = getUserByTelegramId(body.target_telegram_id)
  if (!targetUser) {
    return reply.code(404).send({ ok: false, error: 'Пользователь не найден. Попросите его отправить /start боту.' })
  }

  if (body.action === 'assign') {
    addUserRole(targetUser.id, UserRole.TEACHER)
    const existingTeacher = getTeacherByUserId(targetUser.id)
    if (!existingTeacher) {
      const teacherName =
        (body.full_name || '').trim() ||
        [targetUser.first_name, targetUser.last_name].filter(Boolean).join(' ') ||
        targetUser.username ||
        'Преподаватель'
      createTeacher(targetUser.id, teacherName)
    }
    appendAuditLog(adminCheck.user.id, 'admin_teacher_assign', { target_telegram_id: body.target_telegram_id })
    const tgMsg = 'Вам назначена роль преподавателя. Откройте мини-приложение для проверки работ.'
    await notifyUser(body.target_telegram_id, tgMsg)
    createAppNotification(targetUser.id, 'teacher_role_assigned', tgMsg, {})
    return { ok: true }
  }

  removeUserRole(targetUser.id, UserRole.TEACHER)
  deleteTeacherByUserId(targetUser.id)
  appendAuditLog(adminCheck.user.id, 'admin_teacher_remove', { target_telegram_id: body.target_telegram_id })
  const tgMsg = 'Роль преподавателя снята. Если это ошибка — свяжитесь с администратором.'
  await notifyUser(body.target_telegram_id, tgMsg)
  createAppNotification(targetUser.id, 'teacher_role_removed', tgMsg, {})
  return { ok: true }
})

app.post('/api/admin/assign-student', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      teacher_id: z.coerce.number().int().positive(),
      student_id: z.coerce.number().int().positive(),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const adminCheck = requireAdmin(request, body.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const teacher = getTeacherById(body.teacher_id)
  if (!teacher) return reply.code(404).send({ ok: false, error: 'Преподаватель не найден.' })
  const student = getStudentById(body.student_id)
  if (
    !student ||
    ![StudentStatus.STUDYING, StudentStatus.COMPLETED].includes(student.status)
  ) {
    return reply
      .code(404)
      .send({ ok: false, error: 'Ученик не найден или не в статусе "обучается/завершил обучение".' })
  }

  assignTeacherToStudent(body.student_id, body.teacher_id)
  appendAuditLog(adminCheck.user.id, 'admin_assign_student', {
    teacher_id: body.teacher_id,
    student_id: body.student_id,
  })
  const teacherMsg = `К вам прикреплён ученик: ${student.full_name}.`
  const studentMsg = `Вас прикрепили к преподавателю: ${teacher.full_name}.`
  await notifyUser(teacher.telegram_id, teacherMsg)
  await notifyUser(student.telegram_id, studentMsg)
  createAppNotification(teacher.user_id, 'student_assigned', teacherMsg, {
    student_id: body.student_id,
    teacher_id: body.teacher_id,
  })
  createAppNotification(student.user_id, 'teacher_assigned', studentMsg, {
    student_id: body.student_id,
    teacher_id: body.teacher_id,
  })
  return { ok: true }
})

app.post('/api/admin/unassign-student', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      teacher_id: z.coerce.number().int().positive(),
      student_id: z.coerce.number().int().positive(),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const adminCheck = requireAdmin(request, body.telegram_id)
  if (!adminCheck.ok) return reply.code(adminCheck.status).send({ ok: false, error: adminCheck.error })

  const teacherRow = getTeacherById(body.teacher_id)
  const studentRow = getStudentById(body.student_id)
  if (!teacherRow || !studentRow) {
    return reply.code(404).send({ ok: false, error: 'Преподаватель или ученик не найден.' })
  }

  unassignStudentFromTeacher(body.student_id, body.teacher_id)
  appendAuditLog(adminCheck.user.id, 'admin_unassign_student', {
    teacher_id: body.teacher_id,
    student_id: body.student_id,
  })
  const teacherMsg = `Ученик ${studentRow.full_name} снят с вашего ведения.`
  const studentMsg = `Преподаватель ${teacherRow.full_name} снят с вашего обучения.`
  await notifyUser(teacherRow.telegram_id, teacherMsg)
  await notifyUser(studentRow.telegram_id, studentMsg)
  createAppNotification(teacherRow.user_id, 'student_unassigned', teacherMsg, {
    student_id: body.student_id,
    teacher_id: body.teacher_id,
  })
  createAppNotification(studentRow.user_id, 'teacher_unassigned', studentMsg, {
    student_id: body.student_id,
    teacher_id: body.teacher_id,
  })
  return { ok: true }
})

app.get('/api/teacher/dashboard', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return

  const access = resolveTeacherScope(request, query.telegram_id)
  if (!access.ok) return reply.code(access.status).send({ ok: false, error: access.error })
  const pendingHomeworks = access.teacher
    ? getPendingHomeworksForTeacher(access.teacher.id)
    : getAllHomeworks().filter((hw) => hw.status === 'pending')
  const studentsPending = access.teacher
    ? getStudentsWithPendingCount(access.teacher.id)
    : getActiveStudents()
        .map((student) => ({
          ...student,
          pending_count: pendingHomeworks.filter((hw) => hw.student_id === student.id).length,
        }))
        .filter((student) => student.pending_count > 0)
  const latest = pendingHomeworks[0] || null
  const lastStudents = []
  const seen = new Set()
  for (const hw of pendingHomeworks) {
    if (seen.has(hw.student_id)) continue
    seen.add(hw.student_id)
    lastStudents.push({ student_id: hw.student_id, student_name: hw.student_name })
    if (lastStudents.length >= 3) break
  }

  return {
    ok: true,
    data: {
      pendingCount: pendingHomeworks.length,
      latest: latest
        ? {
            id: latest.id,
            student_id: latest.student_id,
            student_name: latest.student_name,
            lesson_number: latest.lesson_number,
            is_bonus: Boolean(latest.is_bonus),
            haircut_name: latest.haircut_name || null,
            created_at: latest.created_at,
          }
        : null,
      students: studentsPending.map((s) => ({
        id: s.id,
        full_name: s.full_name,
        pending_count: s.pending_count,
        has_avatar: Boolean(s.avatar_file_id),
        telegram_id: s.telegram_id,
        username: s.username,
        first_name: s.first_name,
        last_name: s.last_name,
      })),
      lastStudents,
    },
  }
})

app.get('/api/teacher/student-homeworks', async (request, reply) => {
  const query = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      student_id: z.coerce.number().int().positive(),
      include_reviewed: z
        .union([z.boolean(), z.string(), z.undefined()])
        .transform((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : Boolean(v))),
    }),
    request.query,
    reply,
  )
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return

  const access = resolveTeacherScope(request, query.telegram_id)
  if (!access.ok) return reply.code(access.status).send({ ok: false, error: access.error })
  const allowedStudents = access.teacher ? getStudentsByTeacher(access.teacher.id) : getActiveStudents()
  const targetStudent = allowedStudents.find((s) => s.id === query.student_id)
  if (!targetStudent) {
    return reply.code(403).send({ ok: false, error: 'Ученик не прикреплён к этому преподавателю.' })
  }

  const hwRows = getHomeworksByStudent(query.student_id, query.include_reviewed)
  const attMap = getHomeworkAttachmentsByHomeworkIds(hwRows.map((h) => h.id))
  const homeworks = hwRows.map((h) => mapHomeworkForClient(h, attMap.get(h.id)))

  const ratingStats = getStudentRatingStats(query.student_id)
  const teachersOfStudent = getTeachersByStudent(query.student_id).map((t) => ({
    id: t.id,
    full_name: String(t.full_name || '').trim() || [t.first_name, t.last_name].filter(Boolean).join(' ').trim(),
  }))

  return {
    ok: true,
    data: {
      student: {
        id: targetStudent.id,
        full_name: targetStudent.full_name,
        lessons_count: targetStudent.lessons_count,
        status: targetStudent.status,
        student_track: targetStudent.student_track || 'student',
        metro: targetStudent.metro || null,
        about_me: targetStudent.about_me || '',
        average_rating: ratingStats.average_rating,
        ratings_count: ratingStats.ratings_count,
        has_avatar: Boolean(targetStudent.avatar_file_id),
        teachers: teachersOfStudent,
      },
      homeworks,
    },
  }
})

app.get('/api/teacher/students', async (request, reply) => {
  const query = parseSchema(z.object({ telegram_id: telegramIdSchema }), request.query, reply)
  if (!query) return
  if (!assertTelegramWebAppForClaimedId(request, reply, query.telegram_id)) return

  const access = resolveTeacherScope(request, query.telegram_id)
  if (!access.ok) return reply.code(access.status).send({ ok: false, error: access.error })
  const studentsSource = access.teacher ? getStudentsByTeacher(access.teacher.id) : getActiveStudents()
  const pendingPool = access.teacher
    ? getPendingHomeworksForTeacher(access.teacher.id)
    : getAllHomeworks().filter((hw) => hw.status === HomeworkStatus.PENDING)
  const students = studentsSource.map((student) => {
    const stats = getStudentRatingStats(student.id)
    const teachersOfStudent = getTeachersByStudent(student.id).map((t) => ({
      id: t.id,
      full_name: String(t.full_name || '').trim() || [t.first_name, t.last_name].filter(Boolean).join(' ').trim(),
    }))
    return {
      id: student.id,
      full_name: student.full_name,
      lessons_count: student.lessons_count,
      status: student.status,
      average_rating: stats.average_rating,
      student_track: student.student_track || 'student',
      ratings_count: stats.ratings_count,
      pending_homeworks_count: pendingPool.filter((h) => h.student_id === student.id).length,
      has_avatar: Boolean(student.avatar_file_id),
      teachers: teachersOfStudent,
    }
  })
  return { ok: true, data: { students } }
})

app.post('/api/homeworks/:id/comments', async (request, reply) => {
  const params = parseSchema(z.object({ id: z.coerce.number().int().positive() }), request.params, reply)
  const body = parseSchema(
    z.object({ telegram_id: telegramIdSchema, text_content: z.string().trim().min(1).max(2000) }),
    request.body ?? {},
    reply,
  )
  if (!params || !body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return
  const user = resolveUserForRequest(request, body.telegram_id)
  const homework = getHomeworkById(params.id)
  if (!user || !homework) return reply.code(404).send({ ok: false, error: 'Домашнее задание не найдено.' })
  if (!canUserAccessHomework(request, body.telegram_id, homework)) return reply.code(403).send({ ok: false, error: 'Нет доступа к этому заданию.' })

  createHomeworkComment(homework.id, user.id, body.text_content)
  const student = getStudentById(homework.student_id)
  const roles = getUserRoles(user.id)
  if (student && roles.includes(UserRole.TEACHER) && student.user_id !== user.id) {
    createAppNotification(student.user_id, 'homework_comment', 'Преподаватель оставил комментарий к вашему домашнему заданию.', {
      homework_id: homework.id,
      student_id: student.id,
    })
  }
  if (student && student.user_id === user.id) {
    pushInAppForTeachersOfStudent(student.id, 'homework_comment_reply', 'Ученик ответил на комментарий к домашнему заданию.', {
      homework_id: homework.id,
      student_id: student.id,
    })
  }
  return { ok: true }
})

app.post('/api/teacher/review', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      homework_id: z.coerce.number().int().positive(),
      rating: z.coerce.number().int().min(1).max(5).optional().nullable(),
      comment: z.string().optional().nullable(),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return

  const access = resolveTeacherScope(request, body.telegram_id)
  if (!access.ok) return reply.code(access.status).send({ ok: false, error: access.error })
  let teacher = access.teacher
  if (!teacher && access.isAdmin) {
    const teacherName =
      [access.user.first_name, access.user.last_name].filter(Boolean).join(' ') ||
      access.user.username ||
      'Администратор'
    createTeacher(access.user.id, teacherName)
    teacher = getTeacherByUserId(access.user.id)
  }
  if (!teacher) return reply.code(403).send({ ok: false, error: 'Доступ только для преподавателей.' })

  const homework = getHomeworkById(body.homework_id)
  if (!homework) return reply.code(404).send({ ok: false, error: 'Задание не найдено.' })
  if (homework.status !== HomeworkStatus.PENDING) {
    return reply.code(409).send({ ok: false, error: 'Это задание уже проверено.' })
  }
  const allowedStudents = access.isAdmin ? getActiveStudents() : getStudentsByTeacher(teacher.id)
  if (!allowedStudents.some((s) => s.id === homework.student_id)) {
    return reply.code(403).send({ ok: false, error: 'Ученик не прикреплён к этому преподавателю.' })
  }

  const rating = body.rating ? Number(body.rating) : null
  const comment = body.comment ? String(body.comment).trim() : null

  let storedStatus
  if (rating != null) {
    storedStatus = 'approved'
  } else if (comment) {
    storedStatus = 'rejected'
  } else {
    return reply.code(400).send({ ok: false, error: 'Укажите оценку или напишите комментарий.' })
  }
  const storedRating = storedStatus === 'approved' ? rating : null
  createHomeworkReview(body.homework_id, teacher.id, storedRating, comment, storedStatus)
  appendAuditLog(access.user.id, 'teacher_review_homework', { homework_id: body.homework_id, status: storedStatus })

  const lessonText = homework.is_bonus ? 'дополнительное задание' : `урок №${homework.lesson_number}`
  if (storedStatus === 'approved') {
    const stars = '⭐'.repeat(storedRating || 0)
    const chatText = `✅ Проверка ДЗ (${lessonText}): принято.${storedRating ? ` Оценка: ${storedRating}/5.` : ''}${comment ? ` Комментарий: ${comment}` : ''}`
    createChatMessage({
      student_id: homework.student_id,
      sender_user_id: access.user.id,
      text_content: chatText,
      content_type: ChatContentType.SYSTEM,
      file_id: null,
    })
    await notifyUser(
      homework.student_telegram_id,
      `✅ Твое задание по ${lessonText} проверено.\nОценка: ${stars}\n${comment ? `Комментарий: ${comment}` : ''}`,
    )
    createAppNotification(
      homework.student_user_id,
      'homework_review',
      `Задание по ${lessonText} принято. Оценка: ${storedRating} из 5.${comment ? `\nКомментарий: ${comment}` : ''}`,
      { homework_id: body.homework_id, status: 'approved' },
    )
  } else {
    const chatText = `❌ Проверка ДЗ (${lessonText}): нужна доработка.${comment ? ` Комментарий: ${comment}` : ''}`
    createChatMessage({
      student_id: homework.student_id,
      sender_user_id: access.user.id,
      text_content: chatText,
      content_type: ChatContentType.SYSTEM,
      file_id: null,
    })
    await notifyUser(
      homework.student_telegram_id,
      `❌ Твое задание по ${lessonText} нужно доработать.\n${comment ? `Комментарий: ${comment}` : ''}`,
    )
    createAppNotification(
      homework.student_user_id,
      'homework_review',
      `Задание по ${lessonText} нужно доработать.${comment ? `\nКомментарий: ${comment}` : ''}`,
      { homework_id: body.homework_id, status: 'revision' },
    )
  }

  return { ok: true }
})

app.post('/api/teacher-application', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      full_name: z.string().min(2),
      phone: z.string().min(5),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return

  const phone = validatePhone(body.phone)
  if (!phone) return reply.code(400).send({ ok: false, error: 'Укажите корректный номер телефона.' })
  const fullName = String(body.full_name || '').trim()
  if (!fullName) return reply.code(400).send({ ok: false, error: 'Укажите ФИО.' })

  const vkNumeric = getVkNumericUserIdFromRequest(request)
  const parts = fullName.split(/\s+/).filter(Boolean)
  const fn = parts[0] || null
  const ln = parts.length > 1 ? parts.slice(1).join(' ') : null
  const user = getOrCreateUser(body.telegram_id, null, fn, ln, vkNumeric)
  updateUserProfile(user.id, null, fn, ln)

  upsertPendingTeacherApplication(user.id, fullName, phone)

  const msg = `Заявка на роль преподавателя (мини-апп):\n${fullName}\nТелефон: ${phone}\nID в приложении: ${body.telegram_id}`
  notifyAdmins(msg).catch(() => {})
  createAppNotificationsForAdmins('teacher_application', msg, {
    source: 'mini_app',
    telegram_id: body.telegram_id,
    full_name: fullName,
    applicant_user_id: user.id,
  })
  return { ok: true }
})

app.post('/api/students', async (request, reply) => {
  const body = parseSchema(
    z.object({
      telegram_id: telegramIdSchema,
      full_name: z.string(),
      phone: z.string(),
      lessons_count: z.union([z.string(), z.number()]),
      username: z.string().optional().nullable(),
      first_name: z.string().optional().nullable(),
      last_name: z.string().optional().nullable(),
      metro: z.string().optional().nullable(),
    }),
    request.body ?? {},
    reply,
  )
  if (!body) return
  if (!assertTelegramWebAppForClaimedId(request, reply, body.telegram_id)) return

  const fullName = body.full_name.trim()
  const fullNameParts = fullName.split(/\s+/).filter(Boolean)
  const parsedFirstName = fullNameParts[0] || null
  const parsedLastName = fullNameParts.length > 1 ? fullNameParts.slice(1).join(' ') : null
  const normalizedFirstName = parsedFirstName || body.first_name?.trim() || null
  const normalizedLastName = parsedLastName || body.last_name?.trim() || null
  const phone = validatePhone(body.phone)
  const lessonsCount = parseLessons(body.lessons_count)
  if (!fullName) return reply.code(400).send({ ok: false, error: 'Укажите ФИО ученика.' })
  if (!phone) return reply.code(400).send({ ok: false, error: 'Укажите корректный номер телефона.' })
  if (!lessonsCount) {
    return reply.code(400).send({ ok: false, error: 'Количество занятий должно быть целым числом больше нуля.' })
  }

  const existingStudent = resolveStudentForRequest(request, body.telegram_id)
  if (existingStudent) {
    return reply.code(409).send({ ok: false, error: 'Заявка уже существует.', data: { student: existingStudent } })
  }

  const vkNumeric = getVkNumericUserIdFromRequest(request)
  const user = getOrCreateUser(
    body.telegram_id,
    body.username || null,
    normalizedFirstName,
    normalizedLastName,
    vkNumeric,
  )
  updateUserProfile(user.id, body.username || null, normalizedFirstName, normalizedLastName)
  addUserRole(user.id, UserRole.STUDENT)
  const roles = getUserRoles(user.id)
  const primaryRole = roles.includes('admin') ? 'admin' : roles.includes('teacher') ? 'teacher' : roles.includes('student') ? 'student' : null
  const metroSave = body.metro != null && String(body.metro).trim() ? String(body.metro).trim() : null
  let studentId
  try {
    studentId = createStudent(user.id, fullName, phone, lessonsCount, metroSave)
  } catch (err) {
    if (String(err?.code || '') === 'SQLITE_CONSTRAINT_UNIQUE' || String(err?.message || '').includes('UNIQUE')) {
      const row = getStudentByUserId(user.id)
      return reply.code(409).send({
        ok: false,
        error: 'Заявка с этого аккаунта уже существует.',
        data: row ? { student: row } : undefined,
      })
    }
    throw err
  }
  const student = getStudentByUserId(user.id)

  const metroNote = body.metro ? String(body.metro).trim() : ''
  const adminMsg = `Новый ученик из мини-аппа:\n${fullName}\nТелефон: ${phone}${metroNote ? `\nМетро: ${metroNote}` : ''}\nЗанятий: ${lessonsCount}\n\nID в Telegram: ${body.telegram_id}`
  notifyAdmins(adminMsg).catch(() => {})
  createAppNotificationsForAdmins('new_student', adminMsg, {
    source: 'mini_app',
    telegram_id: body.telegram_id,
    full_name: fullName,
  })

  return reply.code(201).send({
    ok: true,
    data: {
      student: {
        id: studentId,
        full_name: student.full_name,
        phone: student.phone,
        lessons_count: student.lessons_count,
        status: student.status ?? StudentStatus.MODERATION,
      },
      role: primaryRole ?? 'student',
      roles,
    },
  })
})

app.post('/api/homeworks', async (request, reply) => {
  try {
    const { fields, files } = await parseHomeworkSubmissionMultipart(request)
    const telegramId = Number(fields.telegram_id)
    if (!telegramId) return reply.code(400).send({ ok: false, error: 'Передайте telegram_id.' })
    if (!assertTelegramWebAppForClaimedId(request, reply, telegramId)) return

    const student = resolveStudentForRequest(request, telegramId)
    if (!student) return reply.code(404).send({ ok: false, error: 'Ученик не найден. Отправьте /start боту.' })
    if (student.status !== StudentStatus.STUDYING) {
      return reply.code(403).send({ ok: false, error: 'Сдача работ доступна только ученикам в статусе "обучается".' })
    }

    const isBonus =
      String(fields.is_bonus ?? '').toLowerCase() === 'true' ||
      fields.is_bonus === '1' ||
      String(fields.is_bonus ?? '').toLowerCase() === 'on'
    const lessonNumber = fields.lesson_number ? Number(fields.lesson_number) : null
    if (!isBonus && (!Number.isInteger(lessonNumber) || lessonNumber <= 0)) {
      return reply.code(400).send({ ok: false, error: 'Укажите номер урока (целое число) или отметьте бонусную работу.' })
    }
    if (!isBonus && student.lessons_count != null && lessonNumber > student.lessons_count) {
      return reply.code(400).send({
        ok: false,
        error: `Урок №${lessonNumber} недоступен. По вашей программе ${student.lessons_count} уроков.`,
      })
    }

    const textContent = String(fields.text_content ?? '').trim()
    const haircutName = String(fields.haircut_name ?? '').trim().slice(0, 200)
    if (!files.length && !textContent) {
      return reply.code(400).send({ ok: false, error: 'Добавьте файл или текстовое описание работы.' })
    }

    if (files.length > 1) {
      const nonImage = files.find((f) => !String(f.mimeType || '').toLowerCase().startsWith('image/'))
      if (nonImage) {
        return reply.code(400).send({
          ok: false,
          error:
            'Несколько файлов за раз можно прикрепить только для фото. Видео или документ отправьте одним файлом (или добавьте текст к серии фото).',
        })
      }
    }

    let contentType = 'text'
    let fileId = null
    if (files.length) {
      const primary = files[0]
      const mime = String(primary.mimeType || '')
      contentType = mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : 'document'
      fileId = primary.path
    }

    let homeworkId
    let txActive = false
    try {
      db.prepare('BEGIN IMMEDIATE').run()
      txActive = true

      const dup = getPendingHomeworkDuplicateForSlot(student.id, isBonus ? null : lessonNumber, isBonus)
      if (dup) {
        const err = new Error('HOMEWORK_DUP_SLOT')
        err.code = 'HOMEWORK_DUP_SLOT'
        throw err
      }

      homeworkId = createHomework(
        student.id,
        isBonus ? null : lessonNumber,
        isBonus,
        contentType,
        fileId,
        textContent || null,
        haircutName || null,
      )

      for (let i = 1; i < files.length; i += 1) {
        const f = files[i]
        const mime = String(f.mimeType || '')
        const ct = mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : 'document'
        insertHomeworkFile(homeworkId, f.path, ct, i)
      }

      db.prepare('COMMIT').run()
      txActive = false
    } catch (e) {
      if (txActive) {
        try {
          db.prepare('ROLLBACK').run()
        } catch {
          // ignore
        }
        txActive = false
      }
      if (e.code === 'HOMEWORK_DUP_SLOT') {
        return reply.code(409).send({
          ok: false,
          error:
            'По этому уроку или бонусу уже есть работа на проверке. Дождитесь проверки преподавателя.',
        })
      }
      throw e
    }

    const homework = getHomeworkById(homeworkId)
    const attRows = getHomeworkAttachments(homeworkId)
    const homeworkOut = {
      id: homework.id,
      lesson_number: homework.lesson_number,
      is_bonus: Boolean(homework.is_bonus),
      haircut_name: homework.haircut_name || null,
      has_local_file: Boolean(resolveHomeworkDiskPath(homework.file_id)),
      has_telegram_file: Boolean(
        homework.file_id && !resolveHomeworkDiskPath(homework.file_id) && isTelegramBotFileId(homework.file_id),
      ),
      status: homework.status,
      content_type: homework.content_type,
      text_content: homework.text_content,
      review_count: 0,
      created_at: homework.created_at,
      ...homeworkAttachmentsPayload(attRows),
    }

    const lessonText = homework.is_bonus ? 'дополнительное задание' : `урок №${homework.lesson_number}`
    const haircutPart = homework.haircut_name ? ` («${homework.haircut_name}»)` : ''
    const notifyText = `Ученик ${homework.student_name} отправил ДЗ по ${lessonText}${haircutPart}.`
    const teachers = getTeachersByStudent(student.id)
    const teacherChatIds = teachers
      .map((t) => Number(t.telegram_id))
      .filter((id) => Number.isInteger(id) && id > 0)

    if (!teachers.length) {
      console.warn(
        `[homework] student_id=${student.id} homework_id=${homeworkId}: нет записей в student_teachers — преподавателям Telegram не отправлялось`,
      )
    } else if (!teacherChatIds.length) {
      console.warn(
        `[homework] student_id=${student.id} homework_id=${homeworkId}: у назначенных преподавателей нет telegram_id в users`,
      )
    }

    const adminExtra =
      !teachers.length || !teacherChatIds.length
        ? '\n\n⚠️ Ученику не назначены преподаватели или у них нет Telegram ID — уведомление в чат преподавателям не ушло. Проверьте связку в админке.'
        : ''

    await notifyUsersAllSettled(teacherChatIds, notifyText)
    await notifyAdmins(notifyText + adminExtra)
    pushInAppForTeachersOfStudent(student.id, 'new_homework', notifyText, {
      student_id: student.id,
      homework_id: homeworkId,
    })
    createAppNotificationsForAdmins('new_homework', notifyText + adminExtra, {
      student_id: student.id,
      homework_id: homeworkId,
    })
    return reply.code(201).send({ ok: true, data: { homework: homeworkOut } })
  } catch (error) {
    if (error.message === 'FILE_TOO_LARGE' || error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({
        ok: false,
        error: `Файл слишком большой. Максимум ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ.`,
      })
    }
    if (error.message === 'TOO_MANY_FILES') {
      return reply.code(400).send({ ok: false, error: 'Можно прикрепить не более 5 файлов за одну отправку.' })
    }
    if (error.message === 'UNSUPPORTED_HEIC') {
      return reply.code(415).send({
        ok: false,
        error: 'Формат HEIC/HEIF не поддерживается на сервере. Сохраните фото как JPG/JPEG и повторите.',
      })
    }
    console.error('Ошибка при загрузке работы:', error.message)
    return reply.code(500).send({ ok: false, error: 'Не удалось загрузить работу. Попробуйте позже.' })
  }
})

app.patch('/api/student/homeworks/:homeworkId', async (request, reply) => {
  try {
    const params = parseSchema(
      z.object({ homeworkId: z.coerce.number().int().positive() }),
      request.params,
      reply,
    )
    if (!params) return
    const { fields, files } = await parseHomeworkSubmissionMultipart(request)
    const telegramId = Number(fields.telegram_id)
    if (!telegramId) return reply.code(400).send({ ok: false, error: 'Передайте telegram_id.' })
    if (!assertTelegramWebAppForClaimedId(request, reply, telegramId)) return
    const student = resolveStudentForRequest(request, telegramId)
    if (!student) return reply.code(404).send({ ok: false, error: 'Ученик не найден.' })

    const hw = getHomeworkById(params.homeworkId)
    if (!hw || hw.student_id !== student.id) {
      return reply.code(404).send({ ok: false, error: 'Задание не найдено.' })
    }
    if (hw.status !== 'pending') {
      return reply.code(403).send({ ok: false, error: 'Редактировать можно только задания, ещё не проверенные преподавателем.' })
    }

    let removeAttachmentIds = []
    try { removeAttachmentIds = JSON.parse(fields.remove_attachment_ids || '[]') } catch { /* ignore */ }
    const removePrimary = fields.remove_primary === '1'

    const newAttachments = files.map((f) => {
      const mime = String(f.mimeType || '')
      const ct = mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : 'document'
      return { file_id: f.path, content_type: ct }
    })

    updatePendingHomework(params.homeworkId, {
      text_content: fields.text_content !== undefined ? fields.text_content : undefined,
      haircut_name: fields.haircut_name !== undefined ? fields.haircut_name : undefined,
      remove_primary: removePrimary,
      remove_attachment_ids: removeAttachmentIds,
      new_attachments: newAttachments,
    })

    const updated = getHomeworkById(params.homeworkId)
    const attRows = getHomeworkAttachments(params.homeworkId)
    return reply.send({
      ok: true,
      data: {
        homework: {
          ...updated,
          has_local_file: Boolean(resolveHomeworkDiskPath(updated.file_id)),
          has_telegram_file: Boolean(updated.file_id && !resolveHomeworkDiskPath(updated.file_id) && isTelegramBotFileId(updated.file_id)),
          ...homeworkAttachmentsPayload(attRows),
        },
      },
    })
  } catch (e) {
    if (e.message?.includes('Редактировать можно')) {
      return reply.code(403).send({ ok: false, error: e.message })
    }
    throw e
  }
})

app.post('/api/student/homeworks/:homeworkId/revision', async (request, reply) => {
  try {
    const params = parseSchema(
      z.object({ homeworkId: z.coerce.number().int().positive() }),
      request.params,
      reply,
    )
    if (!params) return
    const { fields, file } = await parseMultipart(request)
    const telegramId = Number(fields.telegram_id)
    if (!telegramId) return reply.code(400).send({ ok: false, error: 'Передайте telegram_id.' })
    if (!assertTelegramWebAppForClaimedId(request, reply, telegramId)) return
    const student = resolveStudentForRequest(request, telegramId)
    if (!student) return reply.code(404).send({ ok: false, error: 'Ученик не найден.' })
    if (student.status !== StudentStatus.STUDYING) {
      return reply.code(403).send({ ok: false, error: 'Отправка исправлений доступна только ученикам в статусе «обучается».' })
    }
    const text = String(fields.revision_text ?? fields.text ?? '').trim()
    const filePath = file?.path || null
    if (file && !String(file.mimeType || '').toLowerCase().startsWith('image/')) {
      return reply.code(400).send({ ok: false, error: 'К исправлению можно прикрепить только изображение.' })
    }
    const result = submitStudentHomeworkRevision(student.id, params.homeworkId, text, filePath)
    if (!result.ok) {
      if (result.code === 'NOT_FOUND') return reply.code(404).send({ ok: false, error: 'Работа не найдена.' })
      if (result.code === 'NOT_REVISION') {
        return reply
          .code(400)
          .send({ ok: false, error: 'Исправление доступно только для работ со статусом «нужна доработка».' })
      }
      if (result.code === 'NO_TEXT') return reply.code(400).send({ ok: false, error: 'Опишите, что вы исправили.' })
      return reply.code(400).send({ ok: false, error: 'Не удалось сохранить исправление.' })
    }
    const homework = getHomeworkById(params.homeworkId)
    const lessonText = homework.is_bonus ? 'дополнительное задание' : `урок №${homework.lesson_number}`
    const notifyText = `Ученик ${homework.student_name} отправил исправление по ${lessonText}.`
    const teachers = getTeachersByStudent(student.id)
    const teacherChatIds = teachers
      .map((t) => Number(t.telegram_id))
      .filter((id) => Number.isInteger(id) && id > 0)
    await notifyUsersAllSettled(teacherChatIds, notifyText)
    await notifyAdmins(notifyText)
    pushInAppForTeachersOfStudent(student.id, 'homework_revision', notifyText, {
      student_id: student.id,
      homework_id: params.homeworkId,
    })
    createAppNotificationsForAdmins('homework_revision', notifyText, {
      student_id: student.id,
      homework_id: params.homeworkId,
    })
    const attRows = getHomeworkAttachments(homework.id)
    return { ok: true, data: { homework: mapHomeworkForClient(homework, attRows) } }
  } catch (error) {
    if (error.message === 'FILE_TOO_LARGE' || error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({
        ok: false,
        error: `Файл слишком большой. Максимум ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ.`,
      })
    }
    if (error.message === 'UNSUPPORTED_HEIC') {
      return reply.code(415).send({
        ok: false,
        error: 'Формат HEIC/HEIF не поддерживается на сервере. Сохраните фото как JPG/JPEG и повторите.',
      })
    }
    console.error('Ошибка при отправке исправления ДЗ:', error.message)
    return reply.code(500).send({ ok: false, error: 'Не удалось отправить исправление. Попробуйте позже.' })
  }
})

app.setNotFoundHandler((_, reply) => {
  reply.code(404).send({ ok: false, error: 'Маршрут не найден.' })
})

app.setErrorHandler((error, _, reply) => {
  console.error('API error:', error.message)
  if (!reply.sent) {
    reply.code(500).send({ ok: false, error: 'Внутренняя ошибка сервера.' })
  }
})

app.listen({ port: PORT, host: process.env.API_HOST || '0.0.0.0' }).then(() => {
  console.log(`API сервер запущен на http://localhost:${PORT}`)
})
