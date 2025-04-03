/**
 * Servicio de registro de mensajes de chat
 * 
 * Proporciona funciones puras para persistir y recuperar
 * mensajes de chat asociados a tickets
 */

// Almacenamiento en memoria para desarrollo
// En producción, esto debería usar una base de datos persistente
const chatMessagesStore = new Map();

/**
 * Guarda un mensaje en la base de datos
 * @param {Object} message - Mensaje a guardar
 * @returns {Promise<Object>} - Promesa que resuelve al mensaje guardado
 */
export const logMessageToDatabase = async (message) => {
  if (!message || !message.ticketId) {
    return Promise.reject(new Error('Mensaje inválido o sin ID de ticket'));
  }
  
  try {
    // Asegurar que tenemos un array para este ticket
    if (!chatMessagesStore.has(message.ticketId)) {
      chatMessagesStore.set(message.ticketId, []);
    }
    
    // Agregar un ID único al mensaje
    const enhancedMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      saved: true
    };
    
    // Guardar en nuestro store
    chatMessagesStore.get(message.ticketId).push(enhancedMessage);
    
    console.log(`Mensaje guardado para ticket ${message.ticketId}`);
    return Promise.resolve(enhancedMessage);
  } catch (error) {
    console.error('Error al guardar mensaje:', error);
    return Promise.reject(error);
  }
};

/**
 * Recupera mensajes para un ticket específico
 * @param {string} ticketId - ID del ticket
 * @param {Object} options - Opciones de paginación y filtrado
 * @returns {Promise<Array>} - Promesa que resuelve a un array de mensajes
 */
export const getMessagesForTicket = async (ticketId, options = {}) => {
  if (!ticketId) {
    return Promise.reject(new Error('ID de ticket requerido'));
  }
  
  try {
    // Obtener mensajes para este ticket o array vacío si no hay ninguno
    const messages = chatMessagesStore.get(ticketId) || [];
    
    // Aplicar límite si se especifica
    const { limit = 50, offset = 0 } = options;
    const paginatedMessages = messages
      .slice(offset, offset + limit);
    
    return Promise.resolve(paginatedMessages);
  } catch (error) {
    console.error('Error al recuperar mensajes:', error);
    return Promise.reject(error);
  }
};
