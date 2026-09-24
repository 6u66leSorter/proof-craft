import { Module } from '@nestjs/common'
import { AdminModule } from './admin/admin.module.js'
import { ChatModule } from './chat/chat.module.js'
import { HealthModule } from './health/health.module.js'
import { HomeworkFilesModule } from './homework-files/homework-files.module.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { PublicPortfolioModule } from './public-portfolio/public-portfolio.module.js'
import { ProfilesModule } from './profiles/profiles.module.js'
import { HomeworkCommentsModule } from './homework-comments/homework-comments.module.js'
import { WebAuthModule } from './web-auth/web-auth.module.js'
import { AccountModule } from './account/account.module.js'
import { RegistrationModule } from './registration/registration.module.js'
import { SessionModule } from './session/session.module.js'
import { ShowcaseModule } from './showcase/showcase.module.js'
import { StudentAvatarsModule } from './student-avatars/student-avatars.module.js'
import { StudentHomeworksModule } from './student-homeworks/student-homeworks.module.js'
import { TeacherCabinetModule } from './teacher-cabinet/teacher-cabinet.module.js'

@Module({
  imports: [
    AdminModule,
    ChatModule,
    HealthModule,
    HomeworkFilesModule,
    NotificationsModule,
    PublicPortfolioModule,
    ProfilesModule,
    RegistrationModule,
    HomeworkCommentsModule,
    WebAuthModule,
    AccountModule,
    SessionModule,
    ShowcaseModule,
    StudentAvatarsModule,
    StudentHomeworksModule,
    TeacherCabinetModule,
  ],
})
export class AppModule {}
