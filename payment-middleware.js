import https from 'https';

// Função auxiliar para fazer requisições HTTP usando o módulo nativo 'https' para máxima compatibilidade no Node.js
// Aceita `data` como objeto (serializa em JSON) ou string (envia como-está, para form-encoded).
function nativeRequest(url, method, headers, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: parsed });
        } catch (e) {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: body });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      // If data is already a string (e.g. form-encoded), send as-is; otherwise serialize to JSON
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}


export const processPaymentMiddleware = async (req, res) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const {
        encryptedCard,
        cpf,
        saveCard,
        orderTotal,
        clientName,
        clientEmail,
        useSavedCard,
        savedCustomerId,
        savedCardToken
      } = data;
      
      const pagbankToken = process.env.PAGBANK_TOKEN;
      const isMock = !pagbankToken || pagbankToken === 'mock';
      const amountCents = Math.round(orderTotal * 100);
      
      if (isMock) {
        console.warn('[PagBank Middleware] Rodando em modo MOCK. Nenhuma chamada externa à API foi feita.');
        // Simula latência de rede
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        // Simulação de erro caso passe um cartão específico de teste
        if (encryptedCard === 'fail' || encryptedCard === 'invalid_card') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            message: 'Cartão recusado pelo emissor. Verifique os dados e tente novamente.'
          }));
        }
        
        const responseData = {
          success: true,
          chargeId: 'CHAR_MOCK_' + Math.random().toString(36).substring(2, 11).toUpperCase()
        };
        
        if (!useSavedCard && saveCard) {
          responseData.card = {
            customer_id: savedCustomerId || 'CUST_MOCK_' + Math.random().toString(36).substring(2, 11).toUpperCase(),
            card_token: 'CARD_MOCK_' + Math.random().toString(36).substring(2, 11).toUpperCase(),
            brand: 'visa',
            last_digits: '4111'
          };
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(responseData));
      }
      
      // INTEGRAÇÃO REAL COM A API DO PAGBANK (SANDBOX / PRODUÇÃO)
      const headers = {
        'Authorization': `Bearer ${pagbankToken}`,
        'Content-Type': 'application/json'
      };
      
      const baseUrl = 'https://sandbox.api.pagseguro.com'; // Altere para 'https://api.pagseguro.com' se em Produção
      
      // 1. Processar Cobrança (POST /charges)
      const chargePayload = {
        reference_id: 'ORDER_' + Date.now(),
        description: 'Pedido Dona Lu Pastelaria',
        amount: {
          value: amountCents,
          currency: 'BRL'
        },
        payment_method: {
          type: 'CREDIT_CARD',
          installments: 1,
          capture: true,
          card: useSavedCard ? { id: savedCardToken } : { encrypted: encryptedCard }
        }
      };
      
      const chargeRes = await nativeRequest(`${baseUrl}/charges`, 'POST', headers, chargePayload);
      
      if (!chargeRes.ok || (chargeRes.json.status !== 'AUTHORIZED' && chargeRes.json.status !== 'PAID')) {
        const errMsg = chargeRes.json?.error_messages?.[0]?.description || 'Pagamento recusado pelo emissor do cartão.';
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: errMsg }));
      }
      
      const responseData = {
        success: true,
        chargeId: chargeRes.json.id
      };
      
      // 2. Criar Cliente e Registrar Cartão no Cofre (se solicitado e não for uso de cartão salvo)
      if (!useSavedCard && saveCard) {
        let customerId = savedCustomerId;
        
        // Criar cliente se não possuir ID PagBank
        if (!customerId) {
          const customerPayload = {
            name: clientName,
            email: clientEmail,
            tax_id: cpf.replace(/\D/g, '')
          };
          
          const customerRes = await nativeRequest(`${baseUrl}/v1/customers`, 'POST', headers, customerPayload);
          if (customerRes.ok && customerRes.json.id) {
            customerId = customerRes.json.id;
          }
        }
        
        // Salvar cartão no cofre do cliente
        if (customerId) {
          const cardPayload = {
            encrypted: encryptedCard
          };
          
          const cardRes = await nativeRequest(`${baseUrl}/v1/customers/${customerId}/cards`, 'POST', headers, cardPayload);
          
          if (cardRes.ok && cardRes.json.id) {
            responseData.card = {
              customer_id: customerId,
              card_token: cardRes.json.id,
              brand: cardRes.json.brand || 'visa',
              last_digits: cardRes.json.last_digits || '9999'
            };
          }
        }
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(responseData));
      
    } catch (error) {
      console.error('[PagBank Middleware] Erro no processamento de pagamento:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Erro interno do servidor ao processar o pagamento.' }));
    }
  });
};

// Detects placeholder/mock tokens including the APP_USR-MOCK- pattern from the old simulated OAuth flow
function detectIsMock(token) {
  if (!token) return true;
  if (typeof token !== 'string') return true;
  const t = token.trim();
  if (!t || t === 'mock' || t === 'null' || t === 'undefined') return true;
  if (t.startsWith('APP_USR-MOCK-') || t.includes('-MOCK-') || t.startsWith('TEST-')) return true;
  return false;
}

export const createPixMiddleware = async (req, res) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const { token, amount, email, name, cpf, devPercentage } = data;
      
      const isMock = detectIsMock(token);
      
      if (isMock) {
        console.log('[Mercado Pago Pix] Rodando em modo MOCK (token ausente ou fictício).');
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const mockPaymentId = 'PAY_MOCK_' + Math.random().toString(36).substring(2, 11).toUpperCase();
        
        if (!global.mockPayments) {
          global.mockPayments = {};
        }
        global.mockPayments[mockPaymentId] = {
          status: 'pending',
          createdAt: Date.now()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          paymentId: mockPaymentId,
          qrCode: '00020101021226870014br.gov.bcb.pix2565qr-mock-code-dona-lu-pastelaria-1234567890',
          qrCodeBase64: '',
          status: 'pending',
          isMock: true
        }));
      }
      
      // Chamada real ao Mercado Pago
      const mpUrl = 'https://api.mercadopago.com/v1/payments';
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': 'PIX_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)
      };
      
      const firstName = name.split(' ')[0] || 'Cliente';
      const lastName = name.split(' ').slice(1).join(' ') || 'Dona Lu';
      const transactionAmount = parseFloat(amount);
      
      const payload = {
        transaction_amount: transactionAmount,
        description: 'Pedido Dona Lu Pastelaria',
        payment_method_id: 'pix',
        payer: {
          email: email || 'cliente@email.com',
          first_name: firstName,
          last_name: lastName,
          identification: {
            type: 'CPF',
            number: (cpf || '').replace(/\D/g, '') || '45678912364'
          }
        }
      };

      // Split: add application_fee when devPercentage is configured
      if (devPercentage && devPercentage > 0) {
        const fee = parseFloat((transactionAmount * devPercentage / 100).toFixed(2));
        if (fee >= 0.01) {
          payload.application_fee = fee;
          console.log(`[Mercado Pago Pix] Split: application_fee = R$${fee.toFixed(2)} (${devPercentage}%)`);
        }
      }
      
      const response = await nativeRequest(mpUrl, 'POST', headers, payload);
      
      if (!response.ok) {
        console.error('[Mercado Pago Pix] Erro ao criar pagamento:', response.json);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: response.json?.message || 'Erro ao gerar Pix no Mercado Pago.' }));
      }
      
      const r = response.json;
      const qrCode = r.point_of_interaction?.transaction_data?.qr_code || '';
      const qrCodeBase64 = r.point_of_interaction?.transaction_data?.qr_code_base64 || '';
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        paymentId: r.id.toString(),
        qrCode,
        qrCodeBase64,
        status: r.status
      }));
      
    } catch (err) {
      console.error('[Mercado Pago Pix] Erro no middleware:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Erro interno ao criar Pix.' }));
    }
  });
};

export const checkPixMiddleware = async (req, res) => {
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const paymentId = urlObj.searchParams.get('paymentId');
    const token = urlObj.searchParams.get('token');
    
    if (!paymentId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'paymentId é obrigatório.' }));
    }
    
    const isMock = detectIsMock(token) || paymentId.startsWith('PAY_MOCK_');
    
    if (isMock) {
      const mockPay = global.mockPayments?.[paymentId];
      if (mockPay) {
        if (Date.now() - mockPay.createdAt > 5000) {
          mockPay.status = 'approved';
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, status: mockPay.status }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, status: 'approved' }));
    }
    
    // Chamada real ao Mercado Pago
    const mpUrl = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    const headers = {
      'Authorization': `Bearer ${token}`
    };
    
    const response = await nativeRequest(mpUrl, 'GET', headers);
    
    if (!response.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Erro ao verificar pagamento no Mercado Pago.' }));
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, status: response.json.status }));
    
  } catch (err) {
    console.error('[Mercado Pago Pix Status] Erro no middleware:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, message: 'Erro interno ao checar Pix.' }));
  }
};

// Middlewares adicionados para Maquininha Point
if (!global.mockPointIntents) {
  global.mockPointIntents = {};
}

export const createPointOrderMiddleware = async (req, res) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const { token, deviceId, amount, paymentType, externalReference } = data;
      
      const isMock = !token || token === 'mock' || token === '' || token === 'null' || token === 'undefined' || deviceId.includes('MOCK') || deviceId === 'mock';
      
      if (isMock) {
        console.log(`[Mercado Pago Point Dev] Rodando em modo MOCK. Dispositivo: ${deviceId}`);
        const mockIntentId = 'INTENT_MOCK_' + Math.random().toString(36).substring(2, 11).toUpperCase();
        
        global.mockPointIntents[mockIntentId] = {
          status: 'OPEN',
          createdAt: Date.now(),
          amount: parseFloat(amount),
          deviceId
        };

        // Simular aprovação automática após 10 segundos
        setTimeout(() => {
          if (global.mockPointIntents[mockIntentId]) {
            global.mockPointIntents[mockIntentId].status = 'FINISHED';
            global.mockPointIntents[mockIntentId].approvedAt = Date.now();
            console.log(`[Mercado Pago Point Dev Mock] Pagamento ${mockIntentId} APROVADO via simulação.`);
          }
        }, 10000);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          intentId: mockIntentId,
          status: 'OPEN',
          isMock: true
        }));
      }

      // Chamada real ao Mercado Pago Point
      const mpUrl = `https://api.mercadopago.com/point/integration-api/devices/${deviceId}/payment-intents`;
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const payload = {
        amount: parseFloat(amount),
        description: 'Pedido Dona Lu Pastelaria',
        additional_info: {
          external_reference: externalReference || 'PED_' + Date.now(),
          print_on_terminal: true
        },
        payment: {
          installments: 1,
          type: paymentType === 'debito' ? 'debit_card' : 'credit_card'
        }
      };

      const response = await nativeRequest(mpUrl, 'POST', headers, payload);

      if (!response.ok) {
        console.error('[Mercado Pago Point Dev] Erro ao criar intenção de pagamento:', response.json);
        
        // Fallback para mock em desenvolvimento se der erro na API
        const mockIntentId = 'INTENT_MOCK_' + Math.random().toString(36).substring(2, 11).toUpperCase();
        global.mockPointIntents[mockIntentId] = {
          status: 'OPEN',
          createdAt: Date.now(),
          amount: parseFloat(amount),
          deviceId
        };
        setTimeout(() => {
          if (global.mockPointIntents[mockIntentId]) {
            global.mockPointIntents[mockIntentId].status = 'FINISHED';
          }
        }, 10000);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          intentId: mockIntentId,
          status: 'OPEN',
          isMock: true,
          message: 'Modo de testes ativo (erro na API real).'
        }));
      }

      const r = response.json;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        intentId: r.id,
        status: r.state || 'OPEN',
        isMock: false
      }));

    } catch (err) {
      console.error('[Mercado Pago Point Dev] Erro no middleware:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Erro interno ao acionar maquininha.' }));
    }
  });
};

export const checkPointOrderMiddleware = async (req, res) => {
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const intentId = urlObj.searchParams.get('intentId');
    const token = urlObj.searchParams.get('token');
    
    if (!intentId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'intentId é obrigatório.' }));
    }
    
    const isMock = intentId.startsWith('INTENT_MOCK_') || !token || token === 'mock' || token === 'null' || token === 'undefined';
    
    if (isMock) {
      const mockIntent = global.mockPointIntents[intentId];
      if (!mockIntent) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, status: 'CANCELED' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, status: mockIntent.status, isMock: true }));
    }

    // Consulta real ao Mercado Pago Point
    const mpUrl = `https://api.mercadopago.com/point/integration-api/payment-intents/${intentId}`;
    const headers = {
      'Authorization': `Bearer ${token}`
    };

    const response = await nativeRequest(mpUrl, 'GET', headers);

    if (!response.ok) {
      console.error('[Mercado Pago Point Dev] Erro ao consultar intenção:', response.json);
      
      const mockIntent = global.mockPointIntents[intentId];
      if (mockIntent) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, status: mockIntent.status, isMock: true }));
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Erro ao verificar maquininha no Mercado Pago.' }));
    }

    const r = response.json;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, status: r.state || 'OPEN', isMock: false }));

  } catch (err) {
    console.error('[Mercado Pago Point Status Dev] Erro no middleware:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, message: 'Erro interno ao checar maquininha.' }));
  }
};

/**
 * Middleware local para trocar o código OAuth do Mercado Pago por um access_token real.
 * Espelha a lógica do serverless api/mercadopago/exchange-token.js.
 * Em ambiente local, o MP_APP_SECRET deve estar no arquivo .env.local.
 */
export const mpOAuthExchangeMiddleware = async (req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });

  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const { code, clientId, redirectUri } = data;

      const clientSecret = process.env.MP_APP_SECRET || process.env.VITE_MP_APP_SECRET;

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'code OAuth é obrigatório.' }));
      }
      if (!clientId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'clientId é obrigatório.' }));
      }
      if (!clientSecret) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          message: 'MP_APP_SECRET não está configurado. Adicione MP_APP_SECRET no arquivo .env.local para desenvolvimento local.'
        }));
      }

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
        console.error('[MP OAuth Local] Falha na troca de código:', tokenRes.json || tokenRes.text);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          message: tokenRes.json?.message || tokenRes.json?.error_description || 'Erro ao trocar código por token.',
          details: tokenRes.json
        }));
      }

      const { access_token, refresh_token, user_id, scope } = tokenRes.json;

      let email = '', nickname = '';
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
      } catch { /* non-fatal */ }

      console.log(`[MP OAuth Local] Token trocado com sucesso para userId: ${user_id} (${email})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        accessToken: access_token,
        refreshToken: refresh_token,
        userId: user_id,
        scope,
        email,
        nickname
      }));

    } catch (err) {
      console.error('[MP OAuth Local] Erro interno:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Erro interno ao trocar código por token.' }));
    }
  });
};
