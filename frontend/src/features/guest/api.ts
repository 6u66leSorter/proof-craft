import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../api/client'
import { useApp } from '../../app/store'
import type { HomeworkBase } from '../../domain/homework'
import type { StudentTrack } from '../../domain/format'

export type GuestPortfolioStudent = {
  id: number
  full_name: string
  student_track: StudentTrack | null
  metro: string | null
  has_avatar: boolean
  works_count: number | null
  average_rating: number | null
}

export type GuestStudent = GuestPortfolioStudent & {
  lessons_count: number | null
  about_me: string | null
  teachers: { id: number; full_name: string }[]
}

export type GuestHomework = HomeworkBase

export function useGuestPortfolio() {
  const platform = useApp((s) => s.platform)
  return useQuery({
    queryKey: ['guest', 'portfolio'],
    queryFn: async () =>
      (await apiGet<{ students?: GuestPortfolioStudent[] }>(platform, '/api/guest/portfolio-students')).students ?? [],
  })
}

export function useGuestStudentPortfolio(studentId: number | null) {
  const platform = useApp((s) => s.platform)
  return useQuery({
    queryKey: ['guest', 'student', studentId],
    enabled: studentId != null,
    queryFn: async () => {
      const data = await apiGet<{ student?: GuestStudent; homeworks?: GuestHomework[] }>(
        platform,
        `/api/guest/students/${encodeURIComponent(String(studentId))}/portfolio`,
      )
      return { student: data.student ?? null, homeworks: data.homeworks ?? [] }
    },
  })
}
