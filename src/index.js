/**
 * Main application entry point
 * Wires together server and shell components
 */
import Koa from 'koa';
import cors from '@koa/cors';
import http from 'http';
import { initializeApi } from './api/index.js';
import { createClient } from '@supabase/supabase-js';
import n8nClient from './shell/n8nClient.js';
import { initializeWebSocketServer } from './ws/index.js';
import { getConfig } from './config.js';

/**
 * Obtener y validar la configuración del sistema
 */
const config = getConfig();
console.log(`🔧 Modo ${config.server.nodeEnv}: Configuración cargada`);

/**
 * Crear clientes de servicio basados en la configuración
 */
const supabaseClient = config.services.supabase.url && config.services.supabase.key
  ? createClient(config.services.supabase.url, config.services.supabase.key)
  : null;

if (supabaseClient) {
  console.log('✅ Supabase configurado correctamente');
} else {
  console.warn('⚠️ Supabase no configurado - funcionalidad limitada');
}

/**
 * Initialize Koa application
 */
const app = new Koa();

/**
 * Inject dependencies
 * This is where we wire together the pure core with the imperative shell
 */
const deps = {
  n8nClient,
  supabaseClient,
  supabaseAuth: {
    // Implementar métodos de autenticación basados en la configuración
    signIn: async (email, password) => {
      if (!supabaseClient) throw new Error('Supabase no configurado');
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email, password
      });
      if (error) throw error;
      return data;
    },
    // Otros métodos de autenticación...
  }
};

/**
 * Configure middleware and routes
 */

// Lista de orígenes permitidos basada en el entorno
const allowedOrigins = config.server.isProduction
  ? [
      'https://platform.advancio.io',
      'https://api-platform.advancio.io'
    ]
  : [
      'http://localhost:5172',
      'https://localhost:5172',
      'http://localhost:5173',
      'https://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://platform.advancio.io',
      'https://api-platform.advancio.io'
    ];

// Configuración simplificada de CORS para evitar problemas
app.use(cors({
  origin: (ctx) => {
    const requestOrigin = ctx.request.header.origin;
    console.log(`📝 CORS: Solicitud recibida de origen: ${requestOrigin}`);
    
    // Si no hay origen en la solicitud (como curl o postman)
    // Nunca devolver '*' porque es incompatible con credentials:true
    if (!requestOrigin) {
      return config.server.isProduction 
        ? false 
        : (allowedOrigins[0] || false); // Usar el primer origen permitido en desarrollo
    }
    
    // Verificar si el origen está en la lista de permitidos
    if (allowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }
    
    // En desarrollo, ser más permisivo
    if (!config.server.isProduction) {
      console.log(`⚠️ CORS: Permitiendo origen no listado en modo desarrollo: ${requestOrigin}`);
      return requestOrigin;
    }
    
    console.log(`❌ CORS: Bloqueando origen no permitido: ${requestOrigin}`);
    return false; // Bloqueamos orígenes no permitidos en producción
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  exposeHeaders: ['Content-Length', 'Date', 'X-Request-Id'],
  maxAge: 86400 // 24 horas en segundos
}));

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = {
      error: {
        message: err.message,
        code: err.code || 'INTERNAL_SERVER_ERROR'
      }
    };
    console.error('Request error:', err);
  }
});

// Add a simple health check endpoint for connectivity testing
app.use(async (ctx, next) => {
  if (ctx.path === '/health') {
    ctx.body = { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: config.server.nodeEnv,
      version: process.env.APP_VERSION || '1.0.0'
    };
    ctx.status = 200;
  } else {
    await next();
  }
});

// Función principal asíncrona para inicializar la aplicación
const startServer = async () => {
  try {
    // Inicializar API de forma asíncrona
    await initializeApi(app, deps);
    
    /**
     * Create HTTP server to attach WebSockets
     */
    const server = http.createServer(app.callback());
    
    /**
     * Initialize WebSocket server
     */
    initializeWebSocketServer(server);
    
    /**
     * Start server
     */
    server.listen(config.server.port, () => {
      console.log(`🚀 Servidor iniciado en modo ${config.server.nodeEnv}`);
      console.log(`📡 Escuchando en puerto ${config.server.port}`);
      console.log(`💻 URL base: ${config.server.baseUrl}`);
      console.log(`🔒 CORS configurado para: ${config.security.corsOrigin}`);
      console.log(`📝 Endpoints disponibles:`);
      console.log(`  - POST /api/commands - Central command endpoint`);
      console.log(`  - GET /api/state/:userId - State reconstruction endpoint`);
      console.log(`  - WS /ws/tickets/:ticketId - WebSocket chat for tickets`);
      console.log(`  - GET /health - Health check endpoint`);
    });
  } catch (error) {
    console.error('❌ Error al inicializar el servidor:', error);
    process.exit(1);
  }
};

// Iniciar el servidor
startServer();
