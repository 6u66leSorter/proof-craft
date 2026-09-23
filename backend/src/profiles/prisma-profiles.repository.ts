import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  ProfilesRepository,
  type PendingProfileEdit,
} from './profiles.repository.js'
import type {
  ProfileEditReviewAction,
  ReviewProfileEditCommand,
} from './profile-edit-review.body.js'

@Injectable()
export class PrismaProfilesRepository implements ProfilesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listPendingProfileEdits(): Promise<PendingProfileEdit[]> {
    const edits = await this.prisma.student_profile_edits.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        student_id: true,
        new_full_name: true,
        new_phone: true,
        new_metro: true,
        created_at: true,
        students: {
          select: {
            full_name: true,
            phone: true,
            metro: true,
            users: { select: { telegram_id: true } },
          },
        },
      },
    })
    return edits.map((edit) => ({
      id: edit.id,
      studentId: edit.student_id,
      newFullName: edit.new_full_name,
      newPhone: edit.new_phone,
      newMetro: edit.new_metro,
      createdAt: edit.created_at,
      currentFullName: edit.students.full_name,
      currentPhone: edit.students.phone,
      currentMetro: edit.students.metro,
      telegramId: Number(edit.students.users.telegram_id),
    }))
  }

  async reviewProfileEdit(
    command: ReviewProfileEditCommand,
    reviewerTelegramId: number,
    reviewedAt: string,
  ): Promise<boolean> {
    return await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.student_profile_edits.updateMany({
        where: { id: command.editId, status: 'pending' },
        data: {
          status: command.action === 'approve' ? 'approved' : 'rejected',
          reviewed_at: reviewedAt,
          reviewed_by_telegram_id: reviewerTelegramId,
          ...(command.action === 'reject'
            ? { admin_comment: command.comment }
            : {}),
        },
      })
      if (claimed.count === 0) return false

      if (command.action === 'approve') {
        const edit = await transaction.student_profile_edits.findUniqueOrThrow({
          where: { id: command.editId },
          select: {
            student_id: true,
            new_full_name: true,
            new_phone: true,
            new_metro: true,
          },
        })
        await transaction.students.update({
          where: { id: edit.student_id },
          data: {
            full_name: edit.new_full_name,
            phone: edit.new_phone,
            metro: edit.new_metro,
            updated_at: reviewedAt,
          },
        })
      }
      return true
    })
  }

  async recordProfileEditReview(
    actorUserId: number,
    editId: number,
    action: ProfileEditReviewAction,
  ): Promise<void> {
    const auditAction =
      action === 'approve'
        ? 'profile_edit_approved'
        : 'profile_edit_rejectd' // BUG-002: legacy event name is part of the current contract.
    await this.prisma.audit_log.create({
      data: {
        actor_user_id: actorUserId,
        action: auditAction,
        meta: JSON.stringify({ edit_id: editId }),
      },
    })
  }

  async findStudentForEdit(userId: number): Promise<{
    studentId: number
    fullName: string
    status: string
  } | null> {
    const student = await this.prisma.students.findUnique({
      where: { user_id: userId },
      select: { id: true, full_name: true, status: true },
    })
    return student
      ? { studentId: student.id, fullName: student.full_name, status: student.status }
      : null
  }

  async submitStudentProfileEdit(
    studentId: number,
    edit: { fullName: string; phone: string; metro: string | null },
  ): Promise<number> {
    return await this.prisma.$transaction(async (transaction) => {
      await transaction.student_profile_edits.updateMany({
        where: { student_id: studentId, status: 'pending' },
        data: { status: 'rejected' },
      })
      const created = await transaction.student_profile_edits.create({
        data: {
          student_id: studentId,
          new_full_name: edit.fullName,
          new_phone: edit.phone,
          new_metro: edit.metro,
        },
        select: { id: true },
      })
      return created.id
    })
  }

  async recordStudentProfileEditSubmission(
    actorUserId: number,
    studentId: number,
    studentFullName: string,
  ): Promise<number[]> {
    return await this.prisma.$transaction(async (transaction) => {
      const admins = await transaction.users.findMany({
        where: { user_roles: { some: { role: 'admin' } } },
        select: { id: true, telegram_id: true },
      })
      await transaction.audit_log.create({
        data: {
          actor_user_id: actorUserId,
          action: 'student_profile_edit_submitted',
          meta: JSON.stringify({ student_id: studentId }),
        },
      })
      const body = `Ученик ${studentFullName} отправил заявку на изменение профиля.`
      for (const admin of admins) {
        await transaction.app_notifications.create({
          data: {
            user_id: admin.id,
            kind: 'profile_edit_pending',
            body,
            payload: JSON.stringify({ student_id: studentId }),
          },
        })
      }
      return admins.map(({ telegram_id }) => Number(telegram_id))
    })
  }

  async updateStudentAbout(
    userId: number,
    aboutMe: string | null,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await this.prisma.students.updateMany({
      where: { user_id: userId },
      data: { about_me: aboutMe, updated_at: updatedAt },
    })
    return result.count > 0
  }

  async updateTeacherAbout(
    userId: number,
    aboutMe: string | null,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await this.prisma.teachers.updateMany({
      where: { user_id: userId },
      data: { about_me: aboutMe, updated_at: updatedAt },
    })
    return result.count > 0
  }
}
