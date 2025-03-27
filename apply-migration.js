/**
 * Script para aplicar la migración de la base de datos
 * Usa el cliente de Supabase para ejecutar SQL directamente
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Verificar variables de entorno requeridas
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Se requieren las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// Crear cliente de Supabase con la clave de servicio para tener acceso completo
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Ruta al archivo SQL
const sqlFile = path.join(process.cwd(), 'migrations', '001_create_events_table.sql');

// Función para aplicar la migración
async function applyMigration() {
  try {
    console.log('Leyendo archivo SQL...');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('Conectando a Supabase...');
    
    // Verificar la conexión
    const { data: connectionTest, error: connectionError } = await supabase.from('_test_connection').select('*').limit(1).maybeSingle();
    
    if (connectionError && connectionError.code !== '42P01') { // Ignorar error si la tabla no existe
      console.error('Error conectando a Supabase:', connectionError.message);
      return;
    }
    
    console.log('Conexión exitosa a Supabase');
    
    // Dado que no podemos ejecutar SQL directamente con el cliente de Supabase,
    // mostramos instrucciones para el usuario
    console.log('\n===========================================================');
    console.log('INSTRUCCIONES PARA APLICAR LA MIGRACIÓN MANUALMENTE:');
    console.log('===========================================================');
    console.log('1. Accede al panel de control de Supabase: https://supabase.com/dashboard');
    console.log('2. Selecciona tu proyecto');
    console.log('3. Ve a la sección "SQL Editor"');
    console.log('4. Crea una nueva consulta');
    console.log('5. Copia y pega el siguiente SQL:');
    console.log('\n----- INICIO DEL SQL -----\n');
    console.log(sql);
    console.log('\n----- FIN DEL SQL -----\n');
    console.log('6. Ejecuta la consulta');
    console.log('===========================================================');
    
    // Crear un archivo SQL temporal para facilitar la copia
    const tempSqlFile = path.join(process.cwd(), 'migration-to-apply.sql');
    fs.writeFileSync(tempSqlFile, sql);
    console.log(`\nEl SQL también ha sido guardado en: ${tempSqlFile}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Ejecutar la migración
applyMigration();
