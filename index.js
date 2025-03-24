import Koa from 'koa'
import { setupRoutes } from './routes.js'
import { zohoClient, supabaseClient, config } from './config.js'
import { notifyExternal } from './notifications.js'

const app = new Koa()

// Dependencias inyectadas
const deps = {
  zohoClient,
  supabaseClient,
  eventMap: {
    TICKET_CREATED: (payload) => notifyExternal(payload, { zohoClient }),
    TICKET_UPDATED: (payload) => notifyExternal(payload, { zohoClient }),
    COMMENT_ADDED: (payload) => notifyExternal(payload, { zohoClient }),
    TICKET_ESCALATED: (payload) => notifyExternal(payload, { zohoClient }),
  },
}

// Configuración de rutas
app.use(setupRoutes(deps))

// Iniciar servidor
app.listen(config.PORT, () =>
  console.log(`Servidor ejecutándose en el puerto ${config.PORT}`)
)