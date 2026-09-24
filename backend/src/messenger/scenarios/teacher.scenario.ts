import { Inject, Injectable } from '@nestjs/common'
import { ReviewTeacherHomeworkUseCase } from '../../teacher-cabinet/review-teacher-homework.use-case.js'
import { GetTeacherDashboardUseCase, GetTeacherStudentHomeworksUseCase } from '../../teacher-cabinet/teacher-cabinet.use-cases.js'
import { ConversationStore } from '../conversation.store.js'
import { hasRole } from '../messenger-identity.service.js'
import { dataOf, type ScenarioContext } from '../scenario.context.js'

type PendingStudent = { id: number; full_name: string; pending_count: number }
type TeacherHomework = {
  id: number
  status: string
  is_bonus: boolean
  lesson_number: number | null
  content_type: string
  file_id: string | null
  text_content: string | null
  has_local_file: boolean
  has_telegram_file: boolean
}

/**
 * Панель преподавателя: ученики с работами на проверке, просмотр работ
 * и проверка. Проверка идёт через `ReviewTeacherHomeworkUseCase` — он проверяет назначение,
 * запрещает повторную проверку и сам уведомляет ученика.
 */
@Injectable()
export class TeacherScenario {
  constructor(
    @Inject(GetTeacherDashboardUseCase) private readonly dashboard: GetTeacherDashboardUseCase,
    @Inject(GetTeacherStudentHomeworksUseCase) private readonly studentHomeworks: GetTeacherStudentHomeworksUseCase,
    @Inject(ReviewTeacherHomeworkUseCase) private readonly review: ReviewTeacherHomeworkUseCase,
    @Inject(ConversationStore) private readonly conversations: ConversationStore,
  ) {}

  async menu(context: ScenarioContext): Promise<void> {
    if (!hasRole(context.principal, 'teacher')) {
      await context.reply('У вас нет доступа к панели преподавателя.')
      return
    }
    const students = dataOf<{ students: PendingStudent[] }>(await this.dashboard.execute(context.principal)).students
    if (!students.length) {
      await context.reply('📝 У вас нет непроверенных заданий.')
      return
    }
    await context.reply({
      text: `📝 Проверить задания:\n\n${students.map((s) => `${s.full_name} (${s.pending_count} непроверенных)\n`).join('')}`,
      buttons: students.map((s) => [{ text: `${s.full_name} (${s.pending_count})`, data: `teacher_student_${s.id}` }]),
    })
  }

  async handleButton(context: ScenarioContext, data: string, answer: (text?: string) => Promise<void>): Promise<boolean> {
    const student = /^teacher_student_(\d+)$/.exec(data)
    if (student) {
      await this.showPending(context, Number(student[1]))
      await answer()
      return true
    }
    const approve = /^review_approve_(\d+)$/.exec(data)
    if (approve) {
      this.conversations.set(context.channel.kind, context.chatId, {
        type: 'review',
        step: 'rating',
        homeworkId: Number(approve[1]),
        action: 'approve',
        rating: null,
      })
      await context.reply('⭐ Введите оценку от 1 до 5:')
      await answer()
      return true
    }
    const comment = /^review_comment_(\d+)$/.exec(data)
    if (comment) {
      this.conversations.set(context.channel.kind, context.chatId, {
        type: 'review',
        step: 'comment',
        homeworkId: Number(comment[1]),
        action: 'comment',
        rating: null,
      })
      await context.reply('💬 Введите комментарий для ученика (задание будет отправлено на доработку):')
      await answer()
      return true
    }
    return false
  }

  private async showPending(context: ScenarioContext, studentId: number): Promise<void> {
    const homeworks = dataOf<{ homeworks: TeacherHomework[] }>(
      await this.studentHomeworks.execute(context.principal, { studentId, includeReviewed: false }),
    ).homeworks.filter((hw) => hw.status === 'pending')
    if (!homeworks.length) {
      await context.reply('Нет непроверенных заданий у этого ученика.')
      return
    }
    for (const hw of homeworks) {
      let text = `📝 ${hw.is_bonus ? 'Дополнительное' : `Урок №${hw.lesson_number}`}\n`
      if (hw.text_content) text += `Текст: ${hw.text_content}\n`
      if (hw.file_id) text += `Файл: ${hw.content_type}\n`
      const buttons = [[
        { text: '✅ Принять', data: `review_approve_${hw.id}` },
        { text: '💬 Без оценки', data: `review_comment_${hw.id}` },
      ]]
      const canAttach = (hw.content_type === 'photo' || hw.content_type === 'video') && hw.file_id && (hw.has_local_file || hw.has_telegram_file)
      await context.reply({
        text,
        buttons,
        ...(canAttach ? { media: { kind: hw.content_type as 'photo' | 'video', fileRef: hw.file_id!, isLocalFile: hw.has_local_file } } : {}),
      })
    }
  }

  /** Шаги диалога проверки: оценка, затем комментарий («-» — без комментария). */
  async handleReviewInput(
    context: ScenarioContext,
    conversation: { step: 'rating' | 'comment'; homeworkId: number; action: 'approve' | 'comment'; rating: number | null },
    text: string | null,
  ): Promise<void> {
    if (conversation.step === 'rating') {
      const rating = Number.parseInt(text ?? '', 10)
      if (!rating || rating < 1 || rating > 5) {
        await context.reply('Оценка должна быть от 1 до 5. Попробуйте ещё раз.')
        return
      }
      this.conversations.set(context.channel.kind, context.chatId, { type: 'review', ...conversation, step: 'comment', rating })
      await context.reply('✏️ Введите комментарий (или отправьте "-" чтобы пропустить):')
      return
    }
    this.conversations.delete(context.channel.kind, context.chatId)
    const comment = text === '-' ? null : text
    await this.review.execute(context.principal, {
      homeworkId: conversation.homeworkId,
      rating: conversation.action === 'approve' ? conversation.rating : null,
      comment,
    })
    await context.reply('✅ Проверка сохранена.')
  }
}
