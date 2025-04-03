/**
 * Mapa de clientes WebSocket
 * 
 * Almacena la relación entre IDs de tickets y conexiones WebSocket
 * Mantiene el estado separado del comportamiento
 */

// Mapa inmutable de clientes (ticketId -> conexiones)
const clientsMap = new Map();

/**
 * Agrega un cliente al mapa para un ticket específico
 * @param {string} ticketId - ID del ticket
 * @param {WebSocket} ws - Conexión WebSocket
 * @returns {void}
 */
export const addClient = (ticketId, ws) => {
  if (!clientsMap.has(ticketId)) {
    clientsMap.set(ticketId, new Set());
  }
  clientsMap.get(ticketId).add(ws);
  console.log(`Cliente agregado al ticket ${ticketId}. Total clientes: ${clientsMap.get(ticketId).size}`);
};

/**
 * Elimina un cliente del mapa
 * @param {string} ticketId - ID del ticket
 * @param {WebSocket} ws - Conexión WebSocket
 * @returns {void}
 */
export const removeClient = (ticketId, ws) => {
  if (clientsMap.has(ticketId)) {
    clientsMap.get(ticketId).delete(ws);
    console.log(`Cliente eliminado del ticket ${ticketId}. Clientes restantes: ${clientsMap.get(ticketId).size}`);
    
    // Si no quedan clientes para ese ticket, eliminar la entrada
    if (clientsMap.get(ticketId).size === 0) {
      clientsMap.delete(ticketId);
      console.log(`Eliminada entrada para ticket ${ticketId}`);
    }
  }
};

/**
 * Transmite un mensaje a todos los clientes conectados a un ticket específico
 * @param {string} ticketId - ID del ticket
 * @param {object} message - Mensaje a transmitir
 * @returns {number} - Número de clientes a los que se transmitió el mensaje
 */
export const broadcastToTicket = (ticketId, message) => {
  if (!clientsMap.has(ticketId)) {
    return 0;
  }
  
  const clients = clientsMap.get(ticketId);
  const serializedMessage = JSON.stringify(message);
  let count = 0;
  
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(serializedMessage);
      count++;
    }
  });
  
  console.log(`Mensaje enviado a ${count} clientes para el ticket ${ticketId}`);
  return count;
};

// Exponer el mapa solo para pruebas o depuración, no debería usarse directamente
export const getClientsMap = () => clientsMap;
