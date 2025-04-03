/**
 * Manejador de chat para WebSockets
 * 
 * Gestiona conexiones WebSocket para el chat en tiempo real de tickets
 * Sigue un enfoque funcional y modular
 */
import { addClient, removeClient, broadcastToTicket } from './clientsMap.js';
import { logMessageToDatabase } from '../services/chatLogService.js';

/**
 * Extrae el ID del ticket de la URL de la solicitud WebSocket
 * @param {object} req - Objeto de solicitud HTTP
 * @returns {string|null} - ID del ticket o null si no se pudo extraer
 */
export const extractTicketIdFromReq = (req) => {
  try {
    // La URL es algo como /ws/tickets/:ticketId
    const url = req.url;
    const matches = url.match(/\/ws\/tickets\/([a-zA-Z0-9_-]+)/);
    return matches && matches[1] ? matches[1] : null;
  } catch (error) {
    console.error('Error al extraer ticketId de la URL:', error);
    return null;
  }
};

/**
 * Crea un manejador de chat para WebSockets
 * @returns {Function} - Función manejadora de conexiones WebSocket
 */
export const createChatHandler = () => (ws, req) => {
  // Extraer el ID del ticket de la URL
  const ticketId = extractTicketIdFromReq(req);
  
  if (!ticketId) {
    console.error('No se pudo extraer el ID del ticket de la URL:', req.url);
    ws.close(1008, 'Ticket ID not provided');
    return;
  }
  
  console.log(`Nueva conexión WebSocket para el ticket ${ticketId}`);
  
  // Registrar cliente en el mapa
  addClient(ticketId, ws);
  
  // Enviar mensaje de bienvenida
  ws.send(JSON.stringify({
    type: 'system',
    content: 'Conectado al chat del ticket',
    timestamp: new Date().toISOString(),
    ticketId
  }));
  
  // Manejar mensajes entrantes
  ws.on('message', (messageData) => {
    try {
      const message = JSON.parse(messageData);
      
      // Validar el mensaje
      if (!message.content || typeof message.content !== 'string') {
        ws.send(JSON.stringify({
          type: 'error',
          content: 'Formato de mensaje inválido',
          timestamp: new Date().toISOString()
        }));
        return;
      }
      
      // Agregar metadatos al mensaje
      const enhancedMessage = {
        ...message,
        ticketId,
        timestamp: new Date().toISOString()
      };
      
      // Guardar en la base de datos (si existe la función)
      if (typeof logMessageToDatabase === 'function') {
        logMessageToDatabase(enhancedMessage).catch(err => {
          console.error('Error al guardar mensaje en la base de datos:', err);
        });
      }
      
      // Transmitir a todos los clientes para este ticket
      broadcastToTicket(ticketId, enhancedMessage);
    } catch (error) {
      console.error('Error al procesar mensaje WebSocket:', error);
      ws.send(JSON.stringify({
        type: 'error',
        content: 'Error al procesar el mensaje',
        timestamp: new Date().toISOString()
      }));
    }
  });
  
  // Manejar desconexión
  ws.on('close', () => {
    console.log(`Conexión WebSocket cerrada para el ticket ${ticketId}`);
    removeClient(ticketId, ws);
  });
  
  // Manejar errores
  ws.on('error', (error) => {
    console.error(`Error en conexión WebSocket para ticket ${ticketId}:`, error);
    removeClient(ticketId, ws);
  });
};
