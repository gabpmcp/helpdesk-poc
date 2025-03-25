/**
 * Script to apply database migrations to Supabase
 * 
 * Usage:
 * node scripts/apply-migration.js
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY to be set in .env
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate environment variables
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env file');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Path to migrations directory
const migrationsDir = path.join(process.cwd(), 'migrations');

// Function to apply a migration
async function applyMigration(filePath) {
  try {
    console.log(`Applying migration: ${path.basename(filePath)}`);
    
    // Read migration file
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Execute SQL using Supabase's REST API
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error(`Error applying migration ${path.basename(filePath)}:`, error);
      return false;
    }
    
    console.log(`Successfully applied migration: ${path.basename(filePath)}`);
    return true;
  } catch (err) {
    console.error(`Error reading or applying migration ${path.basename(filePath)}:`, err);
    return false;
  }
}

// Main function to apply all migrations
async function applyMigrations() {
  try {
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      console.error(`Migrations directory not found: ${migrationsDir}`);
      process.exit(1);
    }
    
    // Get all .sql files in the migrations directory
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to apply in order
    
    if (migrationFiles.length === 0) {
      console.log('No migration files found.');
      process.exit(0);
    }
    
    console.log(`Found ${migrationFiles.length} migration files to apply.`);
    
    // Apply each migration
    let successCount = 0;
    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const success = await applyMigration(filePath);
      if (success) successCount++;
    }
    
    console.log(`Applied ${successCount}/${migrationFiles.length} migrations successfully.`);
    
    if (successCount < migrationFiles.length) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Unexpected error applying migrations:', err);
    process.exit(1);
  }
}

// Run the migrations
applyMigrations();
