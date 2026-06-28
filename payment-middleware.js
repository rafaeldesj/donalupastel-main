import https from 'https';

// Função auxiliar para fazer requisições HTTP usando o módulo nativo 'https' para máxima compatibilidade no Node.js
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
      req.write(JSON.stringify(data));
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
