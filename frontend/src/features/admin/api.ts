import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiGet } from '../../api/client'
import { useApp } from '../../app/store'
import type { StudentTrack } from '../../domain/format'
import type { StudentHomework } from '../student/api'

export type AdminTeacher = { id: number; full_name: string; students_count: number | null; phone?: string | null }

export type AdminStudent = {
  id: number
  telegram_id: number | null
  full_name: string
  phone: string | null
  status: string
  student_track: StudentTrack | null
  lessons_count: number | null
  pending_homeworks_count?: number | null
  average_rating: number | null
  has_avatar: boolean
  teacher_ids?: number[]
  teachers?: { id: number; full_name: string }[]
}

export type TeacherApplication = { id: number; full_name: string; phone: string | null; telegram_id: number | null }

export type ProfileEdit = {
  id: number
  telegram_id: number | null
  current_full_name: string
  current_phone: string
  current_metro: string | null
  new_full_name: string
  new_phone: string
  new_metro: string | null
}

export type AdminStudentProfile = AdminStudent & { metro: string | null; about_me: string | null; teachers: { id: number; full_name: string }[] }

export type FeedbackItem = { id: number; full_name: string; subject: string; message: string; created_at: string }

const withUser = () => `telegram_id=${encodeURIComponent(String(useApp.getState().appUserId))}`
const get = <T,>(path: string) => apiGet<T>(useApp.getState().platform, path)

export const adminKeys = {
  moderation: () => ['admin', 'moderation', useApp.getState().appUserId],
  students: () => ['admin', 'students', useApp.getState().appUserId],
  teachers: () => ['admin', 'teachers', useApp.getState().appUserId],
  student: (id: number | null) => ['admin', 'student', id],
  feedback: () => ['admin', 'feedback', useApp.getState().appUserId],
}

/** Заявки: ученики на модерации, заявки преподавателей, преподаватели и правки профилей. */
export function useAdminModeration() {
  return useQuery({
    queryKey: adminKeys.moderation(),
    refetchOnMount: 'always',
    queryFn: async () => {
      const [students, applications, teachers, edits] = await Promise.all([
        get<{ students?: AdminStudent[] }>(`/api/admin/students?${withUser()}&status=moderation`),
        get<{ applications?: TeacherApplication[] }>(`/api/admin/teacher-applications?${withUser()}`),
        get<{ teachers?: AdminTeacher[] }>(`/api/admin/teachers?${withUser()}`),
        get<{ edits?: ProfileEdit[] }>(`/api/admin/profile-edits?${withUser()}`),
      ])
      return {
        students: students.students ?? [],
        applications: applications.applications ?? [],
        teachers: teachers.teachers ?? [],
        edits: edits.edits ?? [],
      }
    },
  })
}

export function useAdminStudents({ refetchOnMount = true } = {}) {
  return useQuery({
    queryKey: adminKeys.students(),
    refetchOnMount: refetchOnMount ? 'always' : false,
    queryFn: async () => (await get<{ students?: AdminStudent[] }>(`/api/admin/students?${withUser()}`)).students ?? [],
  })
}

export function useAdminTeachers() {
  return useQuery({
    queryKey: adminKeys.teachers(),
    refetchOnMount: 'always',
    queryFn: async () => (await get<{ teachers?: AdminTeacher[] }>(`/api/admin/teachers?${withUser()}`)).teachers ?? [],
  })
}

export async function fetchAdminStudentProfile(studentId: number) {
  const data = await get<{ student?: AdminStudentProfile; homeworks?: StudentHomework[] }>(
    `/api/admin/student/${encodeURIComponent(studentId)}?${withUser()}`,
  )
  return { student: data.student ?? null, homeworks: data.homeworks ?? [] }
}

export function useAdminStudentProfile(studentId: number | null) {
  return useQuery({
    queryKey: adminKeys.student(studentId),
    enabled: studentId != null,
    refetchOnMount: 'always',
    queryFn: () => fetchAdminStudentProfile(studentId!),
  })
}

/** Отзывы учеников с подгрузкой «Показать ещё» по курсору `before`. */
export function useAdminFeedback() {
  return useInfiniteQuery({
    queryKey: adminKeys.feedback(),
    refetchOnMount: 'always',
    initialPageParam: null as string | null,
    getNextPageParam: (last: { next: string | null }) => last.next,
    queryFn: async ({ pageParam }) => {
      const before = pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''
      const data = await get<{ items?: FeedbackItem[]; next?: string | null }>(`/api/admin/feedback?${withUser()}${before}`)
      return { items: data.items ?? [], next: data.next ?? null }
    },
  })
}
