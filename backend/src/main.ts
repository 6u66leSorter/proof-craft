import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module.js'

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? 8788)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('NEST_API_PORT должен быть целым числом от 1 до 65535.')
  }
  return port
}

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  )
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-Telegram-Init-Data',
      'X-Client-Platform',
      'X-VK-User-Id',
      'X-App-User-Id',
      'X-VK-Launch-Params',
      'X-Web-Session',
    ],
  })
  app.enableShutdownHooks()

  const port = parsePort(process.env.NEST_API_PORT)
  const host = process.env.NEST_API_HOST || '127.0.0.1'
  await app.listen(port, host)
  console.info(`Nest API запущен на http://${host}:${port}`)
}

await bootstrap()
