import { Inject, Injectable } from '@nestjs/common'
import { ChangeAdminStudentAssignmentUseCase } from '../../admin/change-admin-student-assignment.use-case.js'
import { ChangeAdminTeacherRoleUseCase } from '../../admin/change-admin-teacher-role.use-case.js'
import { ListAdminStudentsUseCase, ListAdminTeachersUseCase } from '../../admin/admin-read.use-cases.js'
import { ModerateAdminStudentUseCase } from '../../admin/moderate-admin-student.use-case.js'
import { ConversationStore } from '../conversation.store.js'
import { hasRole } from '../messenger-identity.service.js'
import { dataOf, type ScenarioContext } from '../scenario.context.js'
import { personLabel } from './labels.js'

type AdminStudent = { id: number; full_name: string; phone: string; lessons_count: number; username: string | null }
type AdminTeacher = { id: number; full_name: string; username: string | null }

/**
 * Админ-панель бота (legacy `/admin`). Все действия идут через те же use cases, что и HTTP API:
 * права администратора, аудит и уведомления пользователям берутся оттуда.
 */
@Injectable()
export class AdminScenario {
  constructor(
    @Inject(ListAdminStudentsUseCase) private readonly students: ListAdminStudentsUseCase,
    @Inject(ListAdminTeachersUseCase) private readonly teachers: ListAdminTeachersUseCase,
    @Inject(ModerateAdminStudentUseCase) private readonly moderation: ModerateAdminStudentUseCase,
    @Inject(ChangeAdminTeacherRoleUseCase) private readonly teacherRole: ChangeAdminTeacherRoleUseCase,
    @Inject(ChangeAdminStudentAssignmentUseCase) private readonly assignment: ChangeAdminStudentAssignmentUseCase,
    @Inject(ConversationStore) private readonly conversations: ConversationStore,
  ) {}

  async menu(context: ScenarioContext): Promise<void> {
    if (!hasRole(context.principal, 'admin')) {
      await context.reply('У вас нет доступа к админ-панели.')
      return
    }
    await context.reply({
      text: '🔐 Админ-панель',
      buttons: [
        [{ text: '📋 Список на модерации', data: 'admin_moderation' }],
        [{ text: '📋 Список активных учеников', data: 'admin_active' }],
        [{ text: '👨‍🏫 Управление преподавателями', data: 'admin_teachers' }],
      ],
    })
  }

  private async listStudents(context: ScenarioContext, status: 'moderation' | 'active'): Promise<AdminStudent[]> {
    return dataOf<{ students: AdminStudent[] }>(await this.students.execute(context.principal, status)).students
  }

  private async listTeachers(context: ScenarioContext): Promise<AdminTeacher[]> {
    return dataOf<{ teachers: AdminTeacher[] }>(await this.teachers.execute(context.principal)).teachers
  }

  /** Возвращает true, если нажатие обработано этим сценарием. */
  async handleButton(context: ScenarioContext, data: string, answer: (text?: string) => Promise<void>): Promise<boolean> {
    if (data === 'admin_moderation') {
      const students = await this.listStudents(context, 'moderation')
      if (!students.length) await context.reply('Нет заявок на модерации.')
      for (const student of students) {
        await context.reply({
          text: `Новый ученик: ${student.full_name}\nТелефон: ${student.phone}\nКоличество занятий: ${student.lessons_count}`,
          buttons: [[
            { text: '✅ Одобрить', data: `admin_approve_${student.id}` },
            { text: '❌ Отклонить', data: `admin_reject_${student.id}` },
          ]],
        })
      }
      await answer()
      return true
    }
    if (data === 'admin_active') {
      // В legacy у кнопки не было обработчика; показываем тот же список, что и при назначении ученика.
      const students = await this.listStudents(context, 'active')
      await context.reply(
        students.length
          ? `Активные ученики:\n${students.map((s, i) => `${i + 1}. ${personLabel(s.full_name, s.username, s.id)}`).join('\n')}`
          : 'Нет активных учеников.',
      )
      await answer()
      return true
    }
    const decision = /^admin_(approve|reject)_(\d+)$/.exec(data)
    if (decision) {
      await answer()
      const studentId = Number(decision[2])
      const student = (await this.listStudents(context, 'moderation')).find((s) => s.id === studentId)
      const action = decision[1] as 'approve' | 'reject'
      await this.moderation.execute(context.principal, { studentId, action })
      const name = student?.full_name ?? `id ${studentId}`
      await context.reply(action === 'approve' ? `✅ Ученик ${name} одобрен и активирован.` : `❌ Заявка ученика ${name} отклонена.`)
      return true
    }
    if (data === 'admin_teachers') {
      await context.reply({
        text: '👨‍🏫 Управление преподавателями',
        buttons: [
          [{ text: '➕ Назначить преподавателя по ID', data: 'admin_teachers_assign_id' }],
          [{ text: '➖ Удалить преподавателя по ID', data: 'admin_teachers_remove_id' }],
          [{ text: '👥 Назначить ученика преподавателю', data: 'admin_assign_teacher' }],
          [{ text: '📋 Список преподавателей', data: 'admin_teachers_list' }],
        ],
      })
      await answer()
      return true
    }
    if (data === 'admin_teachers_list') {
      const teachers = await this.listTeachers(context)
      await context.reply(
        teachers.length
          ? `Список преподавателей:\n${teachers.map((t, i) => `${i + 1}. ${personLabel(t.full_name, t.username, t.id)}`).join('\n')}`
          : 'Список преподавателей пуст.',
      )
      await answer()
      return true
    }
    if (data === 'admin_teachers_assign_id' || data === 'admin_teachers_remove_id') {
      if (!hasRole(context.principal, 'admin')) {
        await answer('У вас нет доступа к админ-панели.')
        return true
      }
      const assign = data === 'admin_teachers_assign_id'
      this.conversations.set(context.channel.kind, context.chatId, { type: 'admin', step: assign ? 'assignTeacherById' : 'removeTeacherById' })
      await context.reply(
        assign
          ? 'Отправьте Telegram ID пользователя, которого нужно назначить преподавателем.'
          : 'Отправьте Telegram ID преподавателя, которого нужно удалить.',
      )
      await answer()
      return true
    }
    if (data === 'admin_assign_teacher') {
      const teachers = await this.listTeachers(context)
      if (!teachers.length) {
        await context.reply('Сначала назначьте преподавателя.')
      } else {
        await context.reply({
          text: 'Выберите преподавателя:',
          buttons: teachers.map((t) => [{ text: personLabel(t.full_name, t.username, t.id), data: `admin_assign_teacher_${t.id}` }]),
        })
      }
      await answer()
      return true
    }
    const pickTeacher = /^admin_assign_teacher_(\d+)$/.exec(data)
    if (pickTeacher) {
      const teacherId = Number(pickTeacher[1])
      const teacher = (await this.listTeachers(context)).find((t) => t.id === teacherId)
      if (!teacher) {
        await answer('Преподаватель не найден.')
        return true
      }
      const students = await this.listStudents(context, 'active')
      if (!students.length) {
        await context.reply('Нет активных учеников для назначения.')
      } else {
        await context.reply({
          text: `Выберите ученика для преподавателя ${personLabel(teacher.full_name, teacher.username, teacher.id)}:`,
          buttons: students.map((s) => [{ text: personLabel(s.full_name, s.username, s.id), data: `admin_assign_student_${teacherId}_${s.id}` }]),
        })
      }
      await answer()
      return true
    }
    const pickStudent = /^admin_assign_student_(\d+)_(\d+)$/.exec(data)
    if (pickStudent) {
      await this.assignment.assign(context.principal, { teacherId: Number(pickStudent[1]), studentId: Number(pickStudent[2]) })
      await answer('Ученик назначен преподавателю.')
      await context.reply('✅ Ученик назначен преподавателю.')
      return true
    }
    return false
  }

  /** Ввод Telegram ID в диалоге назначения или снятия преподавателя. */
  async handleTeacherIdInput(context: ScenarioContext, step: 'assignTeacherById' | 'removeTeacherById', text: string | null): Promise<void> {
    const value = text?.trim()
    if (!value) {
      await context.reply('Пожалуйста, отправьте текстовое сообщение с Telegram ID.')
      return
    }
    const telegramId = Number.parseInt(value, 10)
    if (!Number.isInteger(telegramId) || telegramId <= 0) {
      await context.reply('Не удалось распознать Telegram ID. Отправьте числовой ID.')
      return
    }
    this.conversations.delete(context.channel.kind, context.chatId)
    const assign = step === 'assignTeacherById'
    await this.teacherRole.execute(context.principal, { targetTelegramId: telegramId, action: assign ? 'assign' : 'remove' })
    await context.reply(assign ? `✅ Пользователь ${telegramId} назначен преподавателем.` : `✅ Преподаватель ${telegramId} удалён.`)
  }
}
