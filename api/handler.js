import { buildApp } from '../backend/dist/server.js'

let appPromise

function getApp() {
  if (!appPromise) {
    appPromise = buildApp().then(async (app) => {
      await app.ready()
      return app
    })
  }
  return appPromise
}

export default async function handler(req, res) {
  const app = await getApp()
  req.url = req.url.replace(/^\/api/, '') || '/'
  app.server.emit('request', req, res)
}
