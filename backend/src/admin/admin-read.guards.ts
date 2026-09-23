import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  type AdminReadRequest,
  parseAuditLimit,
  parseFeedbackBefore,
  parseHomeworkStudentId,
  parseStudentId,
  parseStudentStatus,
} from './admin-read.request.js'

@Injectable()
export class AdminFeedbackQueryGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminReadRequest>()
    const before = parseFeedbackBefore(request.query)
    if (before !== undefined) request.adminFeedbackBefore = before
    return true
  }
}

@Injectable()
export class AdminStudentsQueryGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminReadRequest>()
    request.adminStudentStatus = parseStudentStatus(request.query)
    return true
  }
}

@Injectable()
export class AdminStudentParamsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminReadRequest>()
    request.adminStudentId = parseStudentId(request.params)
    return true
  }
}

@Injectable()
export class AdminHomeworksQueryGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminReadRequest>()
    request.adminHomeworkStudentId = parseHomeworkStudentId(request.query)
    return true
  }
}

@Injectable()
export class AdminAuditQueryGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminReadRequest>()
    request.adminAuditLimit = parseAuditLimit(request.query)
    return true
  }
}
