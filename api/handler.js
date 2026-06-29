let appPromise

// Import dinâmico dentro do try/catch: se o boot falhar (ex: env inválida, que
// agora lança erro em vez de process.exit), conseguimos responder 500 com log
// claro em vez de a função morrer silenciosamente.
function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const { buildApp } = await import('../backend/dist/server.js')
      const app = await buildApp()
      await app.ready()
      return app
    })()
  }
  return appPromise
}

export default async function handler(req, res) {
  try {
    const app = await getApp()
    req.url = req.url.replace(/^\/api/, '') || '/'
    app.server.emit('request', req, res)
  } catch (err) {
    // Permite nova tentativa no próximo cold start (ex: após corrigir env na Vercel),
    // sem precisar de um novo deploy.
    appPromise = undefined
    console.error('[handler] Falha ao inicializar a aplicação:', err)
    res.statusCode = 500
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({ error: 'BOOT_ERROR', message: 'Erro ao inicializar o servidor.' }),
    )
  }
}
