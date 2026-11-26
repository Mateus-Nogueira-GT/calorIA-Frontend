import { describe, expect, it, vi } from 'vitest'
import { uploadUserAvatar } from './users.service.js'

/**
 * A1 do pente fino: o "avatar" era gravado com o contentType declarado, sem
 * olhar os bytes. Um JSON de JWKS subia como image/png e ficava público.
 */
function fakeFastify() {
  const upload = vi.fn().mockResolvedValue({ error: null })
  const fastify = {
    db: vi.fn().mockResolvedValue(Object.assign([{ id: 'u1' }], { count: 1 })),
    supabase: {
      storage: {
        from: () => ({
          upload,
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x/${path}` } }),
          list: vi.fn().mockResolvedValue({ data: [] }),
          remove: vi.fn(),
        }),
      },
    },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  }
  return { fastify, upload }
}

const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`
const pad = (head: number[] | Buffer) => Buffer.concat([Buffer.from(head), Buffer.alloc(32)])
const ftyp = (brand: string) =>
  pad(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`)]))

const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0])
const GIF = pad(Buffer.from('GIF89a'))
const WEBP = pad(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))

describe('uploadUserAvatar: tipo vem dos bytes', () => {
  it.each([
    ['png', 'image/png', PNG, 'image/png', 'png'],
    ['jpeg', 'image/jpeg', JPEG, 'image/jpeg', 'jpg'],
    ['webp', 'image/webp', WEBP, 'image/webp', 'webp'],
    ['gif (iOS não reprocessa)', 'image/gif', GIF, 'image/gif', 'gif'],
    ['heic', 'image/heic', ftyp('heic'), 'image/heic', 'heic'],
    ['heif', 'image/heif', ftyp('mif1'), 'image/heif', 'heif'],
    // Android reencoda WebP grande como JPEG e continua declarando image/webp.
    ['jpeg declarado como webp', 'image/webp', JPEG, 'image/jpeg', 'jpg'],
  ])('%s é aceito e gravado com o tipo detectado', async (_n, declared, bytes, type, ext) => {
    const { fastify, upload } = fakeFastify()
    await uploadUserAvatar(fastify as never, 'u1', dataUrl(declared, bytes))
    expect(upload).toHaveBeenCalledTimes(1)
    const [path, , options] = upload.mock.calls[0]
    expect(path).toMatch(new RegExp(`^u1/\\d+\\.${ext}$`))
    expect(options).toMatchObject({ contentType: type })
  })

  it.each([
    ['JSON de JWKS declarado como png', 'image/png', Buffer.from('{"keys":[{"kty":"EC"}]}')],
    ['SVG', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['HTML declarado como jpeg', 'image/jpeg', Buffer.from('<html><script>1</script></html>')],
    ['vazio', 'image/png', Buffer.alloc(0)],
  ])('%s → 422 INVALID_IMAGE, nada sobe', async (_n, declared, bytes) => {
    const { fastify, upload } = fakeFastify()
    await expect(
      uploadUserAvatar(fastify as never, 'u1', dataUrl(declared, bytes)),
    ).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_IMAGE' })
    expect(upload).not.toHaveBeenCalled()
  })
})
