export type AdminAssignmentTeacher = {
  id: number
  userId: number
  telegramId: number
  fullName: string
  active: boolean
}

export type AdminAssignmentStudent = {
  id: number
  userId: number
  telegramId: number
  fullName: string
  status: string
  track: string
}

export type SaveAdminStudentAssignment = {
  actorUserId: number
  teacher: AdminAssignmentTeacher
  student: AdminAssignmentStudent
  action: 'assign' | 'unassign'
  mutateAssignment: boolean
  teacherMessage: string
  studentMessage: string
}

export abstract class AdminStudentAssignmentRepository {
  abstract findTeacher(id: number): Promise<AdminAssignmentTeacher | null>
  abstract findStudent(id: number): Promise<AdminAssignmentStudent | null>
  abstract saveAssignment(command: SaveAdminStudentAssignment): Promise<void>
}
