import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module.js'
import { HomeworkFilesModule } from './homework-files/homework-files.module.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { PublicPortfolioModule } from './public-portfolio/public-portfolio.module.js'
import { SessionModule } from './session/session.module.js'
import { ShowcaseModule } from './showcase/showcase.module.js'
import { StudentAvatarsModule } from './student-avatars/student-avatars.module.js'
import { StudentHomeworksModule } from './student-homeworks/student-homeworks.module.js'
import { StudentProfileModule } from './student-profile/student-profile.module.js'

@Module({
  imports: [
    HealthModule,
    HomeworkFilesModule,
    NotificationsModule,
    PublicPortfolioModule,
    SessionModule,
    ShowcaseModule,
    StudentAvatarsModule,
    StudentHomeworksModule,
    StudentProfileModule,
  ],
})
export class AppModule {}
