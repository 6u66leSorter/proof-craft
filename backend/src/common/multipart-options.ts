import type { FastifyMultipartBaseOptions } from '@fastify/multipart'

const DEFAULT_MAX_UPLOAD_MB = 450

export const getMultipartOptions = (): FastifyMultipartBaseOptions => {
  const configuredMb = Number(process.env.MAX_HOMEWORK_UPLOAD_MB ?? DEFAULT_MAX_UPLOAD_MB)
  const maxUploadMb = Number.isFinite(configuredMb) && configuredMb > 0
    ? configuredMb
    : DEFAULT_MAX_UPLOAD_MB
  return {
    limits: {
      fileSize: maxUploadMb * 1024 * 1024,
      files: 5,
    },
    throwFileSizeLimit: true,
  }
}
