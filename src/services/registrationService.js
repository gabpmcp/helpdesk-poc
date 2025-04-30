/**
 * Servicio de validación y registro de usuarios
 * 
 * Este servicio se encarga de validar que el email del usuario exista como contacto
 * en Zoho CRM y posteriormente registrarlo en Supabase
 */

import fetch from 'node-fetch';
import supabaseClient, { createSupabaseClient } from '../shell/supabaseClient.js';
import { getConfig } from '../config.js';

/**
 * Valida si un email corresponde a un contacto registrado en Zoho CRM
 * @param {string} email - Email a validar
 * @returns {Promise<Object>} - Datos del contacto si existe
 * @throws {Error} - Si el email no existe o hay un error en la validación
 */
export const validateZohoContact = async (email) => {
  if (!email) {
    throw new Error('Email is required');
  }
  
  try {
    // Normalizar el email (trim y lowercase)
    const normalizedEmail = email.trim().toLowerCase();
    console.log(`🔍 Intentando validar el email ${normalizedEmail} contra Zoho CRM vía n8n...`);
    
    // Utilizamos el webhook de n8n para validar si el email existe en Zoho CRM
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_ACCOUNT_CHECK || 'https://n8n.advancio.io/webhook/account-checkuser';
    console.log(`🔗 URL del webhook: ${n8nWebhookUrl}`);
    
    // Configuración detallada para fetch
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ email: normalizedEmail })
    };
    
    console.log('📤 Enviando solicitud con opciones:', JSON.stringify(fetchOptions));
    
    // Realizar la petición con fetch
    let response;
    try {
      response = await fetch(n8nWebhookUrl, fetchOptions);
      console.log(`📡 Respuesta de n8n: Status ${response.status}, OK: ${response.ok}`);
      console.log('📡 Headers de respuesta:', JSON.stringify([...response.headers.entries()]));
    } catch (fetchError) {
      console.error('❌ Error en fetch:', fetchError);
      throw new Error(`Network error: ${fetchError.message}`);
    }
    
    // Intentamos obtener el texto de la respuesta para depuración
    let responseText = '';
    try {
      responseText = await response.clone().text();
      console.log('📄 Respuesta texto completa:', responseText);
    } catch (textError) {
      console.error('❌ Error obteniendo texto de respuesta:', textError);
    }
    
    // Verificar si hay errores HTTP
    if (!response.ok) {
      console.error(`❌ Error HTTP validando contacto en Zoho CRM (${response.status}):`, responseText);
      throw new Error(`Error validating contact: ${response.statusText || 'Unknown error'} (${response.status})`);
    }
    
    // Intentamos obtener los datos JSON
    let contactData;
    
    try {
      // Intentar parsear la respuesta como JSON
      contactData = await response.json();
      console.log('✅ Datos de contacto recibidos:', JSON.stringify(contactData));
    } catch (err) {
      console.error('❌ Error parsing JSON response:', err);
      console.log('📄 Respuesta texto (en catch):', responseText || 'No disponible');
      
      // Intentamos parsear manualmente si la respuesta no es JSON válido
      try {
        if (responseText) {
          contactData = JSON.parse(responseText);
          console.log('✅ Datos parseados manualmente:', JSON.stringify(contactData));
        }
      } catch (parseErr) {
        console.error('❌ Error en parse manual:', parseErr);
        throw new Error(`Invalid JSON response from webhook: ${responseText.substring(0, 100)}`);
      }
    }
    
    // Verificamos que tengamos datos de contacto
    if (!contactData) {
      console.error('❌ Datos de contacto nulos');
      throw new Error('No contact data received from Zoho CRM');
    }
    
    // CASO ESPECÍFICO: Si la respuesta es un objeto vacío {}, significa que el contacto no existe
    if (Object.keys(contactData).length === 0) {
      console.error('❌ El contacto no existe en Zoho CRM (objeto vacío)');
      throw new Error('Email not registered as a contact in Zoho CRM');
    }
    
    // Si llegamos aquí, el contacto existe y tenemos sus datos
    // Verificamos que tenga los campos esperados
    if (!contactData.email) {
      console.error('❌ Datos de contacto incompletos (falta email):', contactData);
      throw new Error('Incomplete contact data received from Zoho CRM');
    }
    
    // Datos válidos, retornamos la información del contacto
    const result = {
      email: contactData.email,
      fullName: contactData.fullName || '',
      zoho_contact_id: contactData.zoho_contact_id || contactData.id || '',
      zoho_account_id: contactData.zoho_account_id || contactData.companyID?.toString() || '',
      companyName: contactData.companyName || ''
    };
    
    console.log('✅ Contacto validado exitosamente:', result);
    return result;
  } catch (error) {
    console.error('❌ Error en validateZohoContact:', error);
    throw error;
  }
};

/**
 * Confirma manualmente el email de un usuario en Supabase
 * Utiliza múltiples métodos para garantizar que el email quede confirmado
 * @param {string} userId - ID del usuario en Supabase
 * @param {string} email - Email del usuario
 * @returns {Promise<boolean>} - true si se confirmó exitosamente, false en caso contrario
 */
export const confirmUserEmail = async (userId, email) => {
  if (!userId || !email) {
    console.error('❌ confirmUserEmail: userId y email son requeridos');
    return false;
  }

  console.log(`🔑 Confirmando manualmente el email del usuario ${email} (${userId})...`);
  
  // Crear un cliente de Supabase con la clave de servicio para tener permisos administrativos
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  
  let confirmed = false;
  
  // Método 1: Actualizar usuario con updateUserById
  try {
    console.log('🔄 Método 1: Confirmando email con updateUserById...');
    const { error } = await supabase.auth.admin.updateUserById(
      userId,
      { 
        email_confirm: true,
        user_metadata: {
          email_confirmed: true
        }
      }
    );
    
    if (error) {
      console.error('❌ Error confirmando email con updateUserById:', error);
    } else {
      console.log('✅ Email confirmado exitosamente con updateUserById');
      confirmed = true;
    }
  } catch (error) {
    console.error('❌ Error en confirmación con updateUserById:', error);
  }
  
  // Método 2: Actualizar directamente en la base de datos
  if (!confirmed) {
    try {
      console.log('🔄 Método 2: Actualizando directamente en la base de datos...');
      
      // Ejecutar una consulta SQL para actualizar el campo email_confirmed_at
      const { error } = await supabase.rpc('admin_confirm_user_email', {
        p_user_id: userId,
        p_email: email
      });
      
      if (error) {
        console.error('❌ Error en RPC admin_confirm_user_email:', error);
      } else {
        console.log('✅ Email confirmado exitosamente con RPC');
        confirmed = true;
      }
    } catch (error) {
      console.error('❌ Error en actualización directa en DB:', error);
    }
  }
  
  // Método 3: Usar la API REST directamente
  if (!confirmed) {
    try {
      console.log('🔄 Método 3: Confirmando email con API REST...');
      
      const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        }
      });
      
      if (response.ok) {
        console.log('✅ Email confirmado exitosamente con API REST');
        confirmed = true;
      } else {
        const errorData = await response.json();
        console.error('❌ Error en confirmación con API REST:', errorData);
      }
    } catch (error) {
      console.error('❌ Error en confirmación con API REST:', error);
    }
  }
  
  // Método 4: Actualizar directamente en la tabla auth.users
  if (!confirmed) {
    try {
      console.log('🔄 Método 4: Actualizando directamente con SQL...');
      
      // Ejecutar SQL directamente para actualizar el campo email_confirmed_at
      const { error } = await supabase.rpc('admin_update_user_email_confirmed', {
        p_user_id: userId
      });
      
      if (error) {
        console.error('❌ Error en SQL directo:', error);
      } else {
        console.log('✅ Email confirmado exitosamente con SQL directo');
        confirmed = true;
      }
    } catch (error) {
      console.error('❌ Error en SQL directo:', error);
    }
  }
  
  // Verificar el estado actual del usuario
  try {
    console.log('🔍 Verificando estado actual del usuario...');
    
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    
    if (error) {
      console.error('❌ Error obteniendo estado actual del usuario:', error);
    } else if (data && data.user) {
      console.log('📊 Estado actual del usuario:', {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
        confirmed_at: data.user.confirmed_at,
        last_sign_in_at: data.user.last_sign_in_at
      });
      
      // Si el email está confirmado, actualizar el estado
      if (data.user.email_confirmed_at) {
        confirmed = true;
      }
    }
  } catch (error) {
    console.error('❌ Error verificando estado del usuario:', error);
  }
  
  return confirmed;
};

/**
 * Registra un usuario en Supabase después de validar su existencia en Zoho CRM
 * @param {string} email - Email del usuario
 * @param {string} password - Contraseña del usuario
 * @returns {Promise<Object>} - Resultado de la operación
 */
export const registerUser = async (email, password) => {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }
  
  try {
    // 1. Validar que el email existe como contacto en Zoho CRM
    const contactData = await validateZohoContact(email);
    console.log('✅ Contacto validado en Zoho CRM:', {
      email: contactData.email,
      fullName: contactData.fullName,
      zoho_contact_id: contactData.zoho_contact_id,
      zoho_account_id: contactData.zoho_account_id
    });
    
    // 2. Verificar si el usuario ya existe en Supabase
    const supabase = supabaseClient;
    console.log('🔍 Verificando si el usuario ya existe en Supabase...');
    
    let existingUser = null;
    
    try {
      // Intentar iniciar sesión con el email para ver si ya existe
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password
      });
      
      if (!signInError && signInData && signInData.user) {
        console.log('⚠️ El usuario ya existe en Supabase y puede iniciar sesión:', signInData.user.id);
        return {
          success: true,
          email: email,
          user_id: signInData.user.id,
          zoho_contact_id: contactData.zoho_contact_id,
          zoho_account_id: contactData.zoho_account_id,
          already_exists: true
        };
      }
      
      // Si no pudo iniciar sesión, verificamos si el usuario existe pero con otra contraseña
      const { data: adminUsers, error: adminError } = await supabase.auth.admin.listUsers({
        filter: {
          email: email.trim().toLowerCase()
        }
      });
      
      if (!adminError && adminUsers && adminUsers.users && adminUsers.users.length > 0) {
        existingUser = adminUsers.users[0];
        console.log('⚠️ El usuario existe pero con otra contraseña:', existingUser.id);
        
        // Actualizar la contraseña del usuario existente
        try {
          const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { password: password }
          );
          
          if (updateError) {
            console.error('❌ Error actualizando contraseña del usuario existente:', updateError);
          } else {
            console.log('✅ Contraseña actualizada correctamente para el usuario existente');
            return {
              success: true,
              email: email,
              user_id: existingUser.id,
              zoho_contact_id: contactData.zoho_contact_id,
              zoho_account_id: contactData.zoho_account_id,
              password_updated: true
            };
          }
        } catch (updateError) {
          console.error('❌ Error en actualización de contraseña:', updateError);
        }
      }
    } catch (checkError) {
      console.error('❌ Error verificando usuario existente:', checkError);
    }
    
    // 3. Registrar el usuario en Supabase usando la API Admin
    console.log('🔑 Registrando usuario en Supabase usando Admin API:', email);
    
    let userData = null;
    
    // Primero intentamos con la API admin para tener más control
    try {
      const { data: adminAuthData, error: adminAuthError } = await supabase.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true, // Marcar email como confirmado
        user_metadata: {
          full_name: contactData.fullName,
          zoho_contact_id: contactData.zoho_contact_id,
          zoho_account_id: contactData.zoho_account_id,
          company_name: contactData.companyName
        }
      });
      
      if (adminAuthError) {
        console.error('❌ Error registrando usuario con Admin API:', adminAuthError);
      } else if (!adminAuthData || !adminAuthData.user) {
        console.error('❌ No se recibieron datos de usuario de Supabase Admin API');
      } else {
        console.log('✅ Usuario registrado exitosamente con Admin API:', adminAuthData.user.id);
        userData = adminAuthData.user;
      }
    } catch (adminError) {
      console.error('❌ Error con Admin API:', adminError);
    }
    
    // Si falló la API admin, intentamos con signUp normal
    if (!userData) {
      console.log('🔄 Intentando registro con signUp normal...');
      
      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: contactData.fullName,
              zoho_contact_id: contactData.zoho_contact_id,
              zoho_account_id: contactData.zoho_account_id,
              company_name: contactData.companyName
            }
          }
        });
        
        if (authError) {
          console.error('❌ Error registrando usuario con signUp normal:', authError);
        } else if (!authData || !authData.user) {
          console.error('❌ No se recibieron datos de usuario de signUp normal');
        } else {
          console.log('✅ Usuario registrado exitosamente con signUp normal:', authData.user.id);
          userData = authData.user;
        }
      } catch (signUpError) {
        console.error('❌ Error con signUp normal:', signUpError);
      }
    }
    
    // Si después de ambos intentos no tenemos datos de usuario, intentamos un enfoque directo con la API REST
    if (!userData) {
      console.log('🔄 Intentando registro directo con API REST...');
      
      try {
        // Usar fetch para llamar directamente a la API REST de Supabase
        const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_ANON_KEY,
            'X-Client-Info': 'helpdesk-poc'
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            data: {
              full_name: contactData.fullName,
              zoho_contact_id: contactData.zoho_contact_id,
              zoho_account_id: contactData.zoho_account_id,
              company_name: contactData.companyName
            }
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Usuario registrado exitosamente con API REST:', data);
          userData = data.user;
        } else {
          const errorData = await response.json();
          console.error('❌ Error registrando usuario con API REST:', errorData);
        }
      } catch (restError) {
        console.error('❌ Error con API REST:', restError);
      }
    }
    
    // Si aún no tenemos datos de usuario, lanzamos un error
    if (!userData) {
      console.error('❌ No se pudo registrar el usuario después de múltiples intentos');
      throw new Error('Failed to register user after multiple attempts');
    }
    
    // Verificar el estado actual del usuario para asegurarnos de que esté confirmado
    try {
      console.log('🔍 Verificando estado actual del usuario...');
      
      const { data: userStatus, error: getUserError } = await supabase.auth.admin.getUserById(
        userData.id
      );
      
      if (getUserError) {
        console.error('❌ Error obteniendo estado actual del usuario:', getUserError);
      } else if (userStatus && userStatus.user) {
        console.log('📊 Estado actual del usuario:', {
          id: userStatus.user.id,
          email: userStatus.user.email,
          email_confirmed_at: userStatus.user.email_confirmed_at,
          confirmed_at: userStatus.user.confirmed_at,
          last_sign_in_at: userStatus.user.last_sign_in_at
        });
        
        // Si el email no está confirmado, intentar confirmarlo con la función específica
        if (!userStatus.user.email_confirmed_at) {
          console.log('⚠️ Email no confirmado, intentando confirmación manual...');
          const confirmed = await confirmUserEmail(userData.id, email);
          
          if (confirmed) {
            console.log('✅ Email confirmado exitosamente con función específica');
          } else {
            console.error('❌ No se pudo confirmar el email con ningún método');
          }
        }
      }
    } catch (getUserError) {
      console.error('❌ Error verificando estado del usuario:', getUserError);
    }
    
    // 4. Verificar que el usuario se haya registrado correctamente intentando iniciar sesión
    try {
      console.log('🔍 Verificando que el usuario se pueda autenticar...');
      
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      
      if (signInError) {
        console.error('⚠️ Error al intentar iniciar sesión con el usuario recién creado:', signInError);
        
        // Intentar confirmar el email manualmente
        try {
          const { error: confirmError } = await supabase.auth.admin.updateUserById(
            userData.id,
            { email_confirm: true }
          );
          
          if (confirmError) {
            console.error('❌ Error confirmando email del usuario:', confirmError);
          } else {
            console.log('✅ Email confirmado manualmente');
            
            // Intentar iniciar sesión nuevamente
            const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
              email: email.trim().toLowerCase(),
              password
            });
            
            if (retryError) {
              console.error('❌ Error al reintentar inicio de sesión:', retryError);
            } else {
              console.log('✅ Inicio de sesión exitoso después de confirmar email manualmente');
            }
          }
        } catch (confirmError) {
          console.error('❌ Error en confirmación manual de email:', confirmError);
        }
      } else {
        console.log('✅ Usuario puede iniciar sesión correctamente');
      }
    } catch (verifyError) {
      console.error('⚠️ Error en verificación de inicio de sesión:', verifyError);
    }
    
    // Devolver datos relevantes (sin exponer información sensible)
    return {
      success: true,
      email: userData.email,
      user_id: userData.id,
      zoho_contact_id: contactData.zoho_contact_id,
      zoho_account_id: contactData.zoho_account_id
    };
  } catch (error) {
    console.error('❌ Error en registerUser:', error);
    throw error;
  }
};

export default {
  validateZohoContact,
  registerUser,
  confirmUserEmail
};
