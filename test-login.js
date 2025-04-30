/**
 * Script de prueba para verificar el inicio de sesión
 * Cómo usar:
 * node test-login.js email password
 */

// Usamos fetch para hacer la solicitud HTTP
import fetch from 'node-fetch';

// Obtener email y contraseña de los argumentos
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('❌ Uso: node test-login.js email password');
  process.exit(1);
}

// Crear el comando de login
const loginCommand = {
  type: 'LOGIN_ATTEMPT',
  email,
  password,
  timestamp: Date.now()
};

console.log(`🔑 Intentando iniciar sesión para: ${email}`);

// Realizar la petición al backend
fetch('http://localhost:3000/api/commands', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(loginCommand)
})
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log('✅ Login exitoso!');
      console.log(`📧 Usuario: ${data.email}`);
      console.log('🔐 Tokens recibidos');
    } else {
      console.error('❌ Error de login:', data.error || 'Razón desconocida');
    }
    console.log('📊 Respuesta completa:', JSON.stringify(data, null, 2));
  })
  .catch(error => {
    console.error('❌ Error al hacer la petición:', error.message);
  });
