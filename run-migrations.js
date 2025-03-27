/**
 * Script para ejecutar migraciones de la base de datos
 * Ejecuta las migraciones en orden secuencial
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
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Directorio de migraciones
const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

/**
 * Ejecuta una migración SQL
 * @param {string} filePath - Ruta al archivo de migración
 * @returns {Promise<void>}
 */
const runMigration = async (filePath) => {
  try {
    console.log(`Ejecutando migración: ${path.basename(filePath)}`);
    
    // Leer el archivo SQL
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Ejecutar la consulta SQL directamente
    const { error } = await supabase.from('_migrations').insert({
      name: path.basename(filePath),
      executed_at: new Date().toISOString()
    }).select().single();
    
    if (error && error.code !== '42P01') { // Ignorar error si la tabla _migrations no existe aún
      console.log(`Advertencia: No se pudo registrar la migración: ${error.message}`);
    }
    
    // Ejecutar el SQL directamente
    const { error: sqlError } = await supabase.rpc('pg_query', { query: sql });
    
    if (sqlError) {
      throw new Error(`Error ejecutando migración: ${sqlError.message}`);
    }
    
    console.log(`Migración completada: ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`Error en migración ${path.basename(filePath)}:`, error.message);
    throw error;
  }
};

/**
 * Ejecuta todas las migraciones en orden
 */
const runAllMigrations = async () => {
  try {
    // Verificar si el directorio de migraciones existe
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.error(`Error: El directorio de migraciones no existe: ${MIGRATIONS_DIR}`);
      process.exit(1);
    }
    
    // Obtener todos los archivos SQL en el directorio de migraciones
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ordenar alfabéticamente para asegurar el orden correcto
    
    if (migrationFiles.length === 0) {
      console.log('No se encontraron archivos de migración.');
      return;
    }
    
    console.log(`Encontrados ${migrationFiles.length} archivos de migración.`);
    
    // Ejecutar migraciones en secuencia
    for (const file of migrationFiles) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      await runMigration(filePath);
    }
    
    console.log('Todas las migraciones se han completado exitosamente.');
  } catch (error) {
    console.error('Error ejecutando migraciones:', error.message);
    process.exit(1);
  }
};

// Ejecutar todas las migraciones
runAllMigrations();
