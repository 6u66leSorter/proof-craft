import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { requireAdminPrincipal } from '../auth/require-admin-principal.js'
import { UserNotificationGateway } from '../notifications/user-notification.gateway.js'
import type { AdminStudentAssignmentCommand } from './admin-student-assignment.body.js'
import { AdminStudentAssignmentRepository } from './admin-student-assignment.repository.js'

@Injectable()
export class ChangeAdminStudentAssignmentUseCase {
  constructor(
    @Inject(AdminStudentAssignmentRepository)
    private readonly assignments: AdminStudentAssignmentRepository,
    @Inject(UserNotificationGateway)
    private readonly notifications: UserNotificationGateway,
  ) {}

  async assign(
    principal: AuthenticatedPrincipal,
    command: AdminStudentAssignmentCommand,
  ): Promise<{ ok: true }> {
    const admin = requireAdminPrincipal(principal)
    const teacher = await this.assignments.findTeacher(command.teacherId)
    if (!teacher?.active) {
      throw new HttpException(
        { ok: false, error: 'Преподаватель не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }
    const student = await this.assignments.findStudent(command.studentId)
    if (!student || !['studying', 'completed'].includes(student.status)) {
      throw new HttpException(
        {
          ok: false,
          error: 'Ученик не найден или не в статусе "обучается/завершил обучение".',
        },
        HttpStatus.NOT_FOUND,
      )
    }
    const teacherMessage = `К вам прикреплён ученик: ${student.fullName}.`
    const studentMessage = `Вас прикрепили к преподавателю: ${teacher.fullName}.`
    await this.assignments.saveAssignment({
      actorUserId: admin.id,
      teacher,
      student,
      action: 'assign',
      mutateAssignment: student.track !== 'barber',
      teacherMessage,
      studentMessage,
    })
    await this.notifications.send(teacher.telegramId, teacherMessage)
    await this.notifications.send(student.telegramId, studentMessage)
    return { ok: true }
  }

  async unassign(
    principal: AuthenticatedPrincipal,
    command: AdminStudentAssignmentCommand,
  ): Promise<{ ok: true }> {
    const admin = requireAdminPrincipal(principal)
    const [teacher, student] = await Promise.all([
      this.assignments.findTeacher(command.teacherId),
      this.assignments.findStudent(command.studentId),
    ])
    if (!teacher || !student) {
      throw new HttpException(
        { ok: false, error: 'Преподаватель или ученик не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }
    const teacherMessage = `Ученик ${student.fullName} снят с вашего ведения.`
    const studentMessage = `Преподаватель ${teacher.fullName} снят с вашего обучения.`
    await this.assignments.saveAssignment({
      actorUserId: admin.id,
      teacher,
      student,
      action: 'unassign',
      mutateAssignment: true,
      teacherMessage,
      studentMessage,
    })
    await this.notifications.send(teacher.telegramId, teacherMessage)
    await this.notifications.send(student.telegramId, studentMessage)
    return { ok: true }
  }
}
