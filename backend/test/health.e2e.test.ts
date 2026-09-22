import assert from 'node:assert/strict'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module.js'

test('GET /health сохраняет legacy-контракт', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  try {
    const response = await app.inject({ method: 'GET', url: '/health' })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { ok: true })
  } finally {
    await app.close()
  }
})
