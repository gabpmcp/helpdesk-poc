/**
 * Configuración del servidor WebSocket
 * 
 * Inicializa el servidor WebSocket y registra los handlers
 */
import { WebSocketServer } from 'ws';
import { createChatHandler } from './chatHandler.js';

/**
 * Inicializa el servidor WebSocket
 * @param {object} server - Servidor HTTP/HTTPS
 * @returns {WebSocketServer} - Instancia del servidor WebSocket
 */
export const initializeWebSocketServer = (server) => {
  if (!server) {
    throw new Error('Se requiere una instancia de servidor HTTP/HTTPS');
  }
  
  // Crear servidor WebSocket
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  });
  
  // Crear handler para rutas específicas
  const chatHandler = createChatHandler();
  
  // Manejar conexiones
  wss.on('connection', (ws, req) => {
    // Verificar si es una conexión de chat
    if (req.url.startsWith('/ws/tickets/')) {
      chatHandler(ws, req);
    } else {
      console.warn(`Conexión rechazada para ruta no soportada: ${req.url}`);
      ws.close(1008, 'Unsupported route');
    }
  });
  
  console.log('Servidor WebSocket inicializado');
  return wss;
};

export default initializeWebSocketServer;
