import { useState } from 'react';
import { QrCode, Printer, Settings, Eye } from 'lucide-react';

export const TableQrCodeGenerator = () => {
  const [tableCount, setTableCount] = useState<number>(99);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [centerLogo, setCenterLogo] = useState<boolean>(true);
  const [baseUrl, setBaseUrl] = useState<string>(window.location.origin);
  const [customRange, setCustomRange] = useState<boolean>(false);
  const [startRange, setStartRange] = useState<number>(1);
  const [endRange, setEndRange] = useState<number>(99);

  const getTablesArray = () => {
    if (customRange) {
      const start = Math.max(1, startRange);
      const end = Math.min(200, Math.max(start, endRange));
      const arr = [];
      for (let i = start; i <= end; i++) {
        arr.push(i);
      }
      return arr;
    } else {
      const arr = [];
      for (let i = 1; i <= Math.min(200, tableCount); i++) {
        arr.push(i);
      }
      return arr;
    }
  };

  const handlePrint = () => {
    const tables = getTablesArray();
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita pop-ups para imprimir os QR Codes.');
      return;
    }

    const isDark = theme === 'dark';
    const logoUrl = `${window.location.origin}/apple-touch-icon.png`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Imprimir QR Codes de Mesas - Dona Lu</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Playfair+Display:ital,wght@0,600;1,500&display=swap');
          
          body {
            margin: 0;
            padding: 20px;
            font-family: 'Outfit', sans-serif;
            background: #f3f4f6;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            row-gap: 50px; /* Afasta a linha de cima da de baixo */
            column-gap: 20px;
            max-width: 800px;
            margin: 0 auto;
          }

          .card {
            background: ${isDark ? '#0B0E14' : '#ffffff'};
            color: ${isDark ? '#ffffff' : '#0B0E14'};
            border: 2px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(11, 14, 20, 0.1)'};
            border-radius: 20px;
            padding: 15px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            page-break-inside: avoid;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            box-sizing: border-box;
            width: 310px;
            height: 440px;
          }

          .header {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
          }

          .logo {
            width: 130px;
            height: 130px;
            border-radius: 50%;
            border: 2px solid #F59E0B;
            box-shadow: 0 4px 10px rgba(245, 158, 11, 0.3);
          }

          .subtitle {
            font-size: 1.05rem;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            color: #F59E0B;
            margin: 8px 0 0 0;
            font-weight: 800;
            white-space: nowrap;
            text-align: center;
          }

          .qr-wrapper {
            position: relative;
            background: white;
            padding: 8px;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            display: inline-block;
            margin: 10px 0;
          }

          .qr-code {
            display: block;
            width: 140px;
            height: 140px;
          }

          .qr-center-logo {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 34px;
            height: 34px;
            background: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
            border: 1.5px solid #F59E0B;
          }

          .qr-center-logo img {
            width: 24px;
            height: 24px;
            border-radius: 50%;
          }

          .footer-table {
            background: ${isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)'};
            border: 1px solid rgba(245, 158, 11, 0.25);
            padding: 6px 15px;
            border-radius: 10px;
            margin-top: 5px;
            width: 85%;
          }

          .table-number {
            font-size: 1.6rem;
            font-weight: 800;
            color: #F59E0B;
            margin: 0;
            letter-spacing: -0.02em;
          }

          .instruction {
            font-size: 0.6rem;
            color: ${isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(11, 14, 20, 0.5)'};
            margin-top: 2px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          /* Estilos de Impressão */
          @media print {
            @page {
              size: A4;
              margin: 1.5cm;
            }
            body {
              background: none;
              padding: 0;
              margin: 0;
            }
            .grid {
              row-gap: 60px; /* Afastamento vertical extra na impressão */
              column-gap: 20px;
              max-width: 100%;
            }
            .card {
              box-shadow: none;
              border: 2px solid ${isDark ? '#F59E0B' : '#0B0E14'};
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="grid">
          ${tables.map(table => {
      const cleanBase = baseUrl.trim().replace(/\/+$/, '');
      const qrData = `${cleanBase}/?mesa=${table}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}&ecc=H`;

      return `
              <div class="card">
                <div class="header">
                  <img src="${logoUrl}" class="logo" />
                  <p class="subtitle">Cardápio Digital</p>
                </div>
                
                <div class="qr-wrapper">
                  <img src="${qrUrl}" class="qr-code" />
                  ${centerLogo ? `
                    <div class="qr-center-logo">
                      <img src="${logoUrl}" />
                    </div>
                  ` : ''}
                </div>
                
                <div class="footer-table">
                  <div class="table-number">MESA ${table}</div>
                  <div class="instruction">Escaneie para fazer seu pedido</div>
                </div>
              </div>
            `;
    }).join('')}
        </div>
        <script>
          // Autoplay print popup
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 800);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem', margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <QrCode style={{ color: 'var(--primary-gold)' }} size={20} />
          Mesas & QR Codes
        </h3>
        <span style={{ fontSize: '0.78rem', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--primary-gold)', padding: '0.2rem 0.6rem', borderRadius: '20px', fontWeight: 600 }}>
          PWA Autônomo
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
        Gerencie e gere os QR Codes para colar nas mesas do salão. Ao escanear o QR Code, o smartphone do cliente identifica a mesa automaticamente, aplicando taxas corretas e enviando a numeração direto para o garçom e cozinha.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem' }}>

        {/* Painel de Configuração */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fff' }}>
            <Settings size={16} style={{ color: 'var(--primary-gold)' }} /> Configurações de Impressão
          </h4>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => setCustomRange(false)}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '8px',
                border: !customRange ? '2px solid var(--primary-gold)' : '1px solid rgba(255,255,255,0.08)',
                background: !customRange ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                color: !customRange ? 'var(--primary-gold)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              Total de Mesas
            </button>
            <button
              type="button"
              onClick={() => setCustomRange(true)}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '8px',
                border: customRange ? '2px solid var(--primary-gold)' : '1px solid rgba(255,255,255,0.08)',
                background: customRange ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                color: customRange ? 'var(--primary-gold)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              Intervalo Customizado
            </button>
          </div>

          {!customRange ? (
            <div className="input-group">
              <label>Quantidade de Mesas</label>
              <input
                type="number"
                min={1}
                max={200}
                value={tableCount}
                onChange={(e) => setTableCount(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                className="pastel-edit-input"
                style={{ width: '100%' }}
              />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="input-group">
                <label>De (Início)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={startRange}
                  onChange={(e) => setStartRange(Math.max(1, parseInt(e.target.value) || 1))}
                  className="pastel-edit-input"
                />
              </div>
              <div className="input-group">
                <label>Até (Fim)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={endRange}
                  onChange={(e) => setEndRange(Math.min(200, parseInt(e.target.value) || 1))}
                  className="pastel-edit-input"
                />
              </div>
            </div>
          )}

          <div className="input-group">
            <label>URL Base do Cardápio (Detectada)</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="pastel-edit-input"
              style={{ width: '100%' }}
            />
          </div>

          <div className="input-group">
            <label>Tema das Plaquetas</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: theme === 'dark' ? '2px solid var(--primary-gold)' : '1px solid rgba(255,255,255,0.08)',
                  background: theme === 'dark' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                  color: theme === 'dark' ? 'var(--primary-gold)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.82rem'
                }}
              >
                🌌 Escuro (Premium)
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: theme === 'light' ? '2px solid var(--primary-gold)' : '1px solid rgba(255,255,255,0.08)',
                  background: theme === 'light' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                  color: theme === 'light' ? 'var(--primary-gold)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.82rem'
                }}
              >
                ☀️ Claro (Economiza Tinta)
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <input
              type="checkbox"
              id="center-logo-checkbox"
              checked={centerLogo}
              onChange={(e) => setCenterLogo(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--primary-gold)', cursor: 'pointer' }}
            />
            <label htmlFor="center-logo-checkbox" style={{ fontSize: '0.82rem', color: '#fff', cursor: 'pointer', userSelect: 'none' }}>
              Incluir logo no centro do QR Code (Correção de Erro Alta)
            </label>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            style={{
              marginTop: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              background: 'var(--primary-gold)',
              border: 'none',
              color: '#0a0707',
              padding: '0.75rem',
              borderRadius: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.9rem',
              transition: 'transform 0.2s, opacity 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            <Printer size={18} />
            Gerar e Imprimir QR Codes
          </button>
        </div>

        {/* Visualização de Pré-Visualização */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '1.5rem' }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fff' }}>
            <Eye size={16} style={{ color: 'var(--primary-gold)' }} /> Pré-visualização da Plaqueta
          </h4>

          <div style={{
            background: theme === 'dark' ? '#0B0E14' : '#ffffff',
            color: theme === 'dark' ? '#ffffff' : '#0B0E14',
            border: `2px solid ${theme === 'dark' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(11, 14, 20, 0.1)'}`,
            borderRadius: '16px',
            padding: '1.25rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            width: '100%',
            maxWidth: '250px',
            margin: '0 auto',
            boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
          }}>
            {/* Header Plaqueta */}
            <div style={{ display: 'flex', flexDirection: 'column', alignSelf: 'center', alignItems: 'center', gap: '4px' }}>
              <img
                src={`${window.location.origin}/apple-touch-icon.png`}
                alt="Logo"
                style={{ width: '130px', height: '130px', borderRadius: '50%', border: '2px solid #F59E0B', boxShadow: '0 4px 10px rgba(245, 158, 11, 0.3)' }}
              />
              <span style={{
                fontSize: '0.9rem',
                letterSpacing: '0.01em',
                color: 'var(--primary-gold)',
                textTransform: 'uppercase',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                textAlign: 'center',
                marginTop: '8px'
              }}>
                Cardápio Digital
              </span>
            </div>

            {/* QR Mock */}
            <div style={{ position: 'relative', background: 'white', padding: '8px', borderRadius: '10px' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(baseUrl.trim().replace(/\/+$/, '') + '/?mesa=1')}&ecc=H`}
                alt="QR Code Mock"
                style={{ width: '130px', height: '130px', display: 'block' }}
              />
              {centerLogo && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '30px',
                  height: '30px',
                  background: 'white',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                  border: '1.5px solid #F59E0B'
                }}>
                  <img src={`${window.location.origin}/apple-touch-icon.png`} alt="Logo Mini" style={{ width: '22px', height: '22px', borderRadius: '50%' }} />
                </div>
              )}
            </div>

            {/* Rodapé Plaqueta */}
            <div style={{
              background: theme === 'dark' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.04)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              padding: '6px 15px',
              borderRadius: '8px',
              width: '85%'
            }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#F59E0B' }}>MESA 1</div>
              <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(11,14,20,0.4)', marginTop: '2px' }}>
                Escaneie para pedir
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
