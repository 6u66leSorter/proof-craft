import db from './database.js'

// A shared SQLite claim prevents duplicate sends by multiple bot processes.
export function startFeedbackInvites(bot, siteUrl) {
  let url
  try { url = new URL(siteUrl); if (url.protocol !== 'https:') return } catch { return }
  url.searchParams.set('feedback', '1')
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const rows = db.prepare(`SELECT f.*,u.telegram_id FROM feedback_invites f
        JOIN students s ON s.id=f.student_id JOIN users u ON u.id=s.user_id
        WHERE f.delivery_status='pending' LIMIT 20`).all()
      for (const row of rows) {
        // Synthetic VK identities cannot receive Telegram messages.
        if (!row.telegram_id || Number(row.telegram_id) >= 9000000000) continue
        const claimed = db.prepare("UPDATE feedback_invites SET delivery_status='sending' WHERE id=? AND delivery_status='pending'").run(row.id)
        if (!claimed.changes) continue
        try {
          await bot.sendMessage(row.telegram_id,
            `Урок №${row.milestone} принят! Поделитесь впечатлениями о преподавателе и академии. Сообщение увидит только администратор вместе с вашим именем. Преподаватель не получит отзыв или уведомление о нём.`,
            { reply_markup: { inline_keyboard: [[{ text:'Оставить отзыв', url:url.toString() }]] } })
          db.prepare("UPDATE feedback_invites SET delivery_status='sent' WHERE id=?").run(row.id)
        } catch {
          // Do not automatically retry an ambiguous Telegram response.
          db.prepare("UPDATE feedback_invites SET delivery_status='failed' WHERE id=?").run(row.id)
          console.error('Не отправлено приглашение к отзыву:', row.id)
        }
      }
    } finally { running = false }
  }
  const run = () => tick().catch(() => console.error('Ошибка очереди приглашений к отзыву'))
  const timer = setInterval(run, 30000)
  timer.unref()
  run()
}
