import { useState, useEffect } from 'react';
import { ClientSupportChat } from './ClientSupportChat';
import { X, Bot } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const VirtualAssistantBubble = () => {
  const { userData } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);

  const role = userData?.role || 'client';
  const staff = userData?.staffFunctions;
  // Exibir o balão flutuante apenas para quem NÃO é gestor/atendente de suporte (ou seja, apenas para clientes/visitantes)
  const isClientOrVisitor = role === 'client' || (role === 'staff' && staff?.delivery);

  // Show a welcome message tooltip 3 seconds after loading, then hide it after 6 seconds
  useEffect(() => {
    if (!isClientOrVisitor) return;
    
    const timerShow = setTimeout(() => {
      setShowGreeting(true);
    }, 4000);

    const timerHide = setTimeout(() => {
      setShowGreeting(false);
    }, 10000);

    return () => {
      clearTimeout(timerShow);
      clearTimeout(timerHide);
    };
  }, [isClientOrVisitor]);

  if (!isClientOrVisitor) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      fontFamily: 'system-ui, sans-serif'
    }}>
      
      {/* Floating Chat Box Panel */}
      {isOpen && (
        <div style={{
          marginBottom: '12px',
          width: '340px',
          maxWidth: 'calc(100vw - 48px)',
          animation: 'fade-in 0.25s ease-out'
        }}>
          <ClientSupportChat isFloating={true} onClose={() => setIsOpen(false)} />
        </div>
      )}

      {/* Welcome Tooltip Greeting Bubble */}
      {showGreeting && !isOpen && (
        <div style={{
          background: 'var(--primary-gold, #f59e0b)',
          color: '#000',
          padding: '0.5rem 0.85rem',
          borderRadius: '10px 10px 2px 10px',
          fontSize: '0.82rem',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          marginBottom: '10px',
          marginRight: '6px',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          animation: 'bounce 2s infinite'
        }}>
          <span>🥟 Dúvidas? Fale comigo!</span>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowGreeting(false);
            }} 
            style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', padding: 0 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Floating Action Button Bubble */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowGreeting(false);
        }}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: isOpen ? '#1e293b' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          border: 'none',
          color: isOpen ? '#fff' : '#000',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          transition: 'transform 0.2s, background 0.2s',
          outline: 'none'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        title={isOpen ? "Fechar Chat" : "Falar com Atendente Virtual"}
      >
        {isOpen ? <X size={24} /> : <Bot size={26} />}
      </button>

      {/* Keyframe animations injected inline */}
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>

    </div>
  );
};
