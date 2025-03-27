# Instrucciones para configurar la base de datos

Para configurar la base de datos con el nuevo esquema que usa `email` como identificador de agregado en lugar de `user_id`, sigue estos pasos:

## Opción 1: Usando el SQL Editor de Supabase

1. Accede al panel de control de Supabase: https://supabase.com/dashboard
2. Selecciona tu proyecto
3. Ve a la sección "SQL Editor"
4. Crea una nueva consulta
5. Copia y pega el contenido del archivo `migrations/001_create_events_table.sql`
6. Ejecuta la consulta

## Opción 2: Usando la API de Supabase

Si prefieres usar código para ejecutar las migraciones, puedes usar el siguiente script:

```javascript
// Asegúrate de tener instaladas las dependencias:
// npm install @supabase/supabase-js dotenv

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

// Leer el archivo SQL
const sqlFile = path.join(process.cwd(), 'migrations', '001_create_events_table.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

// Dividir el SQL en comandos individuales (separados por punto y coma)
const commands = sql.split(';')
  .map(cmd => cmd.trim())
  .filter(cmd => cmd.length > 0);

// Ejecutar cada comando individualmente
async function runCommands() {
  try {
    for (const cmd of commands) {
      console.log(`Ejecutando: ${cmd.substring(0, 50)}...`);
      
      // Usar la función SQL de Supabase para ejecutar el comando
      const { error } = await supabase.rpc('exec_sql', { sql: cmd + ';' });
      
      if (error) {
        console.error(`Error ejecutando comando: ${error.message}`);
        console.error(`Comando: ${cmd}`);
      }
    }
    
    console.log('Migración completada exitosamente');
  } catch (error) {
    console.error('Error ejecutando migración:', error.message);
  }
}

runCommands();
```

## Verificación

Para verificar que las tablas se han creado correctamente:

1. En el panel de control de Supabase, ve a la sección "Table Editor"
2. Deberías ver las tablas `events` y `user_activity` con los campos actualizados
3. Verifica que el campo `email` esté presente en ambas tablas

## Notas importantes

- Este script elimina las tablas existentes si ya existen
- Asegúrate de tener una copia de seguridad de tus datos si estás ejecutando esto en un entorno de producción
- Las políticas de seguridad (RLS) se configuran para usar `email` como identificador
