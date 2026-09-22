import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../../generated/prisma/client.js'

const requireDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error('Для модулей с БД требуется DATABASE_URL. Пример для SQLite: file:/absolute/path/barber.db')
  }
  if (!url.startsWith('file:')) {
    throw new Error('На baseline-этапе разрешён только SQLite DATABASE_URL с префиксом file:.')
  }
  return url
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaBetterSqlite3({ url: requireDatabaseUrl() })
    super({ adapter })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
