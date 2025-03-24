/**
 * External clients setup (Supabase, Zoho)
 * Part of the imperative shell that handles side effects
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const { 
  ZOHO_AUTH_TOKEN, 
  ZOHO_BASE_URL, 
  PORT = 3000,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
} = process.env

if (!ZOHO_AUTH_TOKEN || !ZOHO_BASE_URL) throw new Error('Missing Zoho env vars')
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing Supabase env vars')

// Supabase client for event store
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Zoho client for ticket management
export const zohoClient = {
  get: (endpoint) =>
    fetch(`${ZOHO_BASE_URL}${endpoint}`, {
      headers: { Authorization: `Zoho-oauthtoken ${ZOHO_AUTH_TOKEN}` },
    }).then(res => res.json()),

  post: (endpoint, body) =>
    fetch(`${ZOHO_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${ZOHO_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(res => res.json()),

  put: (endpoint, body) =>
    fetch(`${ZOHO_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${ZOHO_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(res => res.json()),
}

export const config = { PORT }
