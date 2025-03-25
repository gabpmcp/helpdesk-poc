//  curl --request POST \
//    --url https://accounts.zoho.com/oauth/v2/token \
//    --header 'Content-Type: application/x-www-form-urlencoded' \
//    --data 'client_id=YOUR_CLIENT_ID' \
//    --data 'client_secret=YOUR_CLIENT_SECRET' \
//    --data 'code=GENERATED_CODE' \
//    --data 'grant_type=authorization_code' \
//    --data 'redirect_uri=urn:ietf:wg:oauth:2.0:oob'

// 1000.ffa4a81e815044eb26a96958cfe439e1.b87b56546dd5a9a1b7e992696d9b54b9
const [,, clientId, clientSecret, code] = process.argv;

console.log(clientId, clientSecret, code);

if (!clientId || !clientSecret || !code) {
  console.error('Usage: node get-zoho-token.mjs <CLIENT_ID> <CLIENT_SECRET> <CODE>');
  process.exit(1);
}

const params = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  code,
  grant_type: 'authorization_code',
  redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' // Para Self Client
});

const getToken = async () =>
  fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  })
  .then(res => res.json())
  .then((result) => {
    // console.log(result);
    const { access_token } = result;
    if (!access_token) throw new Error(`Failed to obtain access token: ${JSON.stringify(result)}`);
    console.log(access_token);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

await getToken();