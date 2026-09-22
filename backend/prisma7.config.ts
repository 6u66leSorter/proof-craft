import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Безопасный fallback нужен только для `prisma generate`/`validate`.
    // Runtime PrismaService требует явный DATABASE_URL.
    url: process.env.DATABASE_URL || 'file:./prisma/baseline.db',
  },
})
