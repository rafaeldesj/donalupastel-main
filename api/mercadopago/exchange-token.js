import https from 'https';

/**
 * Helper function using Node's native https module to avoid fetch/axios issues in serverless.
 */
function nativeRequest(url, method, headers, rawBody) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: parsed });
        } catch {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: body });
        }
      });
    });

    req.on('error', reject);
    if (rawBody) req.write(rawBody);
    req.end();
  });
}

/**
 * POST /api/mercadopago/exchange-token
 *
 * Exchanges a Mercado Pago OAuth authorization code for a real access_token.
 * The client_secret is read from the Vercel env variable MP_APP_SECRET.
 * If the env variable is not configured, it falls back to the clientSecret sent
 * in the request body (less secure but allows flexibility during setup).
 *
 * Body: { code, clientId, redirectUri }
 * Returns: { success, accessToken, userId, email, nickname, scope }
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { code, clientId, redirectUri } = req.body || {};

    // Secret: prefer server-side env variable; fallback to body for local testing
    const clientSecret = process.env.MP_APP_SECRET;

    if (!code) {
      return res.status(400).json({ success: false, message: 'code OAuth é obrigatório.' });
    }
    if (!clientId) {
      return res.status(400).json({ success: false, message: 'clientId é obrigatório.' });
    }
    if (!clientSecret) {
      return res.status(500).json({
        success: false,
        message: 'MP_APP_SECRET não está configurado nas variáveis de ambiente do Vercel. Configure a variável de ambiente MP_APP_SECRET com o client_secret da sua aplicação Mercado Pago.'
      });
    }

    // Build form-encoded body for token exchange
    const formBody = [
      'grant_type=authorization_code',
      `client_id=${encodeURIComponent(clientId)}`,
      `client_secret=${encodeURIComponent(clientSecret)}`,
      `code=${encodeURIComponent(code)}`,
      `redirect_uri=${encodeURIComponent(redirectUri || '')}`
    ].join('&');

    const tokenRes = await nativeRequest(
      'https://api.mercadopago.com/oauth/token',
      'POST',
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(formBody).toString()
      },
      formBody
    );

    if (!tokenRes.ok) {
      console.error('[MP OAuth] Falha na troca de código:', tokenRes.json || tokenRes.text);
      const mpError = tokenRes.json?.message || tokenRes.json?.error_description || 'Erro ao trocar código por token no Mercado Pago.';
      return res.status(400).json({ success: false, message: mpError, details: tokenRes.json });
    }

    const { access_token, refresh_token, user_id, scope } = tokenRes.json;

    // Optionally fetch the user's email/name from MP
    let email = '';
    let nickname = '';
    try {
      const userRes = await nativeRequest(
        `https://api.mercadopago.com/users/${user_id}`,
        'GET',
        { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
      );
      if (userRes.ok) {
        email = userRes.json?.email || '';
        nickname = userRes.json?.nickname || userRes.json?.first_name || '';
      }
    } catch {
      // Non-fatal: user info fetch is optional
    }

    console.log(`[MP OAuth] Token trocado com sucesso para userId: ${user_id} (${email})`);

    return res.status(200).json({
      success: true,
      accessToken: access_token,
      refreshToken: refresh_token,
      userId: user_id,
      scope,
      email,
      nickname
    });

  } catch (err) {
    console.error('[MP OAuth Exchange] Erro interno:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao trocar código por token.' });
  }
}
