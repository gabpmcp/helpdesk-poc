export const initiateLiveChat = (client) => (sessionId, message) =>
    client.post(`/chats/${sessionId}/messages`, { content: message })
      .then((data) => ({ chatResponse: data }))
      .catch((err) => Promise.reject({ type: 'CHAT_ERROR', details: err }))
  
  export const handleChatbotMessage = (client) => (message) =>
    client.post('/chatbot/respond', { query: message })
      .then((data) => ({ botResponse: data }))
      .catch((err) => Promise.reject({ type: 'CHATBOT_ERROR', details: err }))