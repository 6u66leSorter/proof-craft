import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../api/client'
import { useApp } from '../../app/store'
import type { StudentTrack } from '../../domain/format'
import type { StudentHomework } from '../student/api'

export type TeacherStudent = {
  id: number
  full_name: string
  status: string
  student_track: StudentTrack | null
  lessons_count: number | null
  pending_homeworks_count?: number | null
  average_rating: number | null
  has_avatar: boolean
  teachers?: { id: number; full_name: string }[]
}

export type TeacherDashboard = {
  pendingCount?: number
  students?: { id: number; full_name: string; pending_count: number; has_avatar: boolean }[]
}

export type TeacherStudentProfile = TeacherStudent & {
  metro: string | null
  about_me: string | null
  teachers: { id: number; full_name: string }[]
}

const withUser = () => `telegram_id=${encodeURIComponent(String(useApp.getState().appUserId))}`

export const teacherStudentsKey = () => ['teacher', 'students', useApp.getState().appUserId]
export const teacherDashboardKey = () => ['teacher', 'dashboard', useApp.getState().appUserId]
export const teacherStudentHomeworksKey = (studentId: number | null) => ['teacher', 'student-homeworks', studentId]

export function useTeacherStudents() {
  return useQuery({
    queryKey: teacherStudentsKey(),
    refetchOnMount: 'always',
    queryFn: async () =>
      (await apiGet<{ students?: TeacherStudent[] }>(useApp.getState().platform, `/api/teacher/students?${withUser()}`)).students ?? [],
  })
}

export function useTeacherDashboard({ refetchOnMount = true } = {}) {
  return useQuery({
    queryKey: teacherDashboardKey(),
    refetchOnMount: refetchOnMount ? 'always' : false,
    queryFn: () => apiGet<TeacherDashboard>(useApp.getState().platform, `/api/teacher/dashboard?${withUser()}`),
  })
}

export async function fetchTeacherStudentHomeworks(studentId: number) {
  const data = await apiGet<{ student?: TeacherStudentProfile; homeworks?: StudentHomework[] }>(
    useApp.getState().platform,
    `/api/teacher/student-homeworks?${withUser()}&student_id=${encodeURIComponent(studentId)}&include_reviewed=true`,
  )
  return { student: data.student ?? null, homeworks: data.homeworks ?? [] }
}

export function useTeacherStudentHomeworks(studentId: number | null) {
  return useQuery({
    queryKey: teacherStudentHomeworksKey(studentId),
    enabled: studentId != null,
    refetchOnMount: 'always',
    queryFn: () => fetchTeacherStudentHomeworks(studentId!),
  })
}
