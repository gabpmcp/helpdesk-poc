import 'dotenv/config'

const { ZOHO_AUTH_TOKEN, ZOHO_BASE_URL, PORT = 3000 } = process.env

if (!ZOHO_AUTH_TOKEN || !ZOHO_BASE_URL) throw new Error('Missing env vars')

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