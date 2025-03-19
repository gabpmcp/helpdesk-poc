import Koa from 'koa'
import { setupRoutes } from './routes.js'
import { zohoClient, config } from './config.js'

const app = new Koa()

const deps = {
  zohoClient,
  eventMap: {
    TICKET_UPDATED: (payload) => Promise.resolve(console.log('Evento:', payload)),
  },
}

app.use(setupRoutes(deps))

app.listen(config.PORT, () =>
  console.log(`Servidor ejecutándose en el puerto ${config.PORT}`)
)