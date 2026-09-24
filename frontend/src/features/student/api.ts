import { useQuery, type QueryFunctionContext } from '@tanstack/react-query'
import { apiGet } from '../../api/client'
import { useApp } from '../../app/store'
import type { HomeworkBase } from '../../domain/homework'

export type HomeworkReview = {
  id: number
  status: 'approved' | 'rejected'
  rating: number | null
  comment: string | null
  teacher_name?: string | null
  created_at: string
}

export type HomeworkComment = {
  id: number
  author_user_id: number
  author_name?: string | null
  author_role?: string | null
  text_content: string
  created_at: string
}

export type StudentHomework = HomeworkBase & {
  student_id: number
  created_at: string
  revision_student_text: string | null
  revision_has_local_file: boolean
  revision_has_telegram_file: boolean
  reviews: HomeworkReview[]
  latest_review: HomeworkReview | null
  comments: HomeworkComment[]
}

export async function fetchStudentHomeworks(_ctx?: QueryFunctionContext): Promise<StudentHomework[]> {
  const { platform, appUserId } = useApp.getState()
  const data = await apiGet<{ homeworks?: StudentHomework[] }>(
    platform,
    `/api/student/homeworks?telegram_id=${encodeURIComponent(String(appUserId))}`,
  )
  return data.homeworks ?? []
}

/** Работы ученика; перечитываются при каждом открытии главной и вкладки «Работы». */
export function useStudentHomeworks() {
  const appUserId = useApp((s) => s.appUserId)
  return useQuery({ queryKey: ['student', 'homeworks', appUserId], queryFn: fetchStudentHomeworks, refetchOnMount: 'always' })
}
