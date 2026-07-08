import { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { OrderDocument } from '../../types/order';
import { Navigation, MapPin, User, Map, List, Clock } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DONA_LU_COORDS: [number, number] = [-22.9112951, -43.5602961];

export default function ManagerDeliveryActive() {
  const [activeTab, setActiveTab] = useState<'list' | 'map'>('map');
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Mapa global
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

  // Escuta os pedidos que estão em rota (delivering)
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'delivering')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: OrderDocument[] = [];
      snapshot.forEach((docSnap) => {
        fetched.push({
          id: docSnap.id,
          ...docSnap.data()
        } as OrderDocument);
      });
      setOrders(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao escutar entregas em andamento:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Inicializa e atualiza o mapa com todos os entregadores ativos
  useEffect(() => {
    if (activeTab !== 'map' || loading || !mapContainerRef.current) return;

    // Inicializa o mapa caso não exista
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: DONA_LU_COORDS,
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 20
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Limpa marcadores e linhas anteriores
    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];

    // Ícone da Pastelaria Dona Lu
    const originIcon = L.divIcon({
      html: `<div style="font-size: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); transform: translate(-2px, -6px);">🏠</div>`,
      className: 'leaflet-div-icon-emoji',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const pastelariaMarker = L.marker(DONA_LU_COORDS, { icon: originIcon })
      .addTo(map)
      .bindPopup('<b>Dona Lu Pastelaria</b><br/>Ponto de Origem 🥟');
    layersRef.current.push(pastelariaMarker);

    const boundsPoints: L.LatLngExpression[] = [DONA_LU_COORDS];

    // Adiciona entregadores e destinos dos pedidos ativos
    orders.forEach((order) => {
      const riderCoords = order.deliveryCoords;
      
      // Ícone do Entregador (Moto)
      const riderIcon = L.divIcon({
        html: `<div style="font-size: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); transform: translate(-2px, -6px); animation: pulse 2s infinite;">🏍️</div>`,
        className: 'leaflet-div-icon-emoji',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      // Marcador do Entregador
      if (riderCoords) {
        const riderMarker = L.marker([riderCoords.lat, riderCoords.lng], { icon: riderIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px;">
              <strong style="color: var(--primary-gold);">🏍️ Entregador: ${order.deliveryName || 'Desconhecido'}</strong><br/>
              <b>Pedido:</b> Seq ${order.dailySeq || '---'} (#${order.id?.slice(-4).toUpperCase()})<br/>
              <b>Status:</b> Em Rota de Entrega
            </div>
          `);
        layersRef.current.push(riderMarker);
        boundsPoints.push([riderCoords.lat, riderCoords.lng]);

        // Se houver endereço com coordenadas do cliente, plota o cliente e desenha a rota
        if (order.clientCoords) {
          const destIcon = L.divIcon({
            html: `<div style="font-size: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); transform: translate(-2px, -6px);">📍</div>`,
            className: 'leaflet-div-icon-emoji',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          });

          const clientMarker = L.marker([order.clientCoords.lat, order.clientCoords.lng], { icon: destIcon })
            .addTo(map)
            .bindPopup(`
              <div style="font-family: sans-serif; font-size: 13px;">
                <strong>📍 Cliente: ${order.clientName}</strong><br/>
                <b>Endereço:</b> ${order.address?.street}, ${order.address?.number}<br/>
                <b>Pedido:</b> Seq ${order.dailySeq || '---'}
              </div>
            `);
          layersRef.current.push(clientMarker);
          boundsPoints.push([order.clientCoords.lat, order.clientCoords.lng]);

          // Desenha polilinha entre Pastelaria -> Entregador -> Cliente
          const pathPoints: [number, number][] = [
            DONA_LU_COORDS,
            [riderCoords.lat, riderCoords.lng],
            [order.clientCoords.lat, order.clientCoords.lng]
          ];

          const polyline = L.polyline(pathPoints, {
            color: '#f59e0b',
            weight: 3,
            opacity: 0.7,
            dashArray: '5, 8'
          }).addTo(map);
          layersRef.current.push(polyline);
        }
      }
    });

    // Enquadra a câmera em todos os pontos se houver entregadores em rota
    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [50, 50] });
    } else {
      map.setView(DONA_LU_COORDS, 14);
    }

  }, [activeTab, orders, loading]);

  // Destrói o mapa ao desmontar o componente
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const formatTimeElapsed = (createdAtStr: string) => {
    const created = new Date(createdAtStr);
    const diffMs = new Date().getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} min atrás`;
    const diffHrs = Math.floor(diffMins / 60);
    return `${diffHrs}h ${diffMins % 60}m atrás`;
  };

  return (
    <div className="dashboard-layout animate-fade-in" style={{ padding: '0.5rem 0' }}>
      {/* Cabeçalho */}
      <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🏍️ Entregas em Andamento
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Acompanhe a rota dos entregadores e o status dos pedidos em tempo real.
          </p>
        </div>

        {/* Sub-menu / Tabs Selector */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '0.25rem'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('map')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '9px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'map' ? 'var(--primary-gold)' : 'transparent',
              color: activeTab === 'map' ? '#0b0f19' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            <Map size={16} />
            Mapa Geral
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '9px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'list' ? 'var(--primary-gold)' : 'transparent',
              color: activeTab === 'list' ? '#0b0f19' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            <List size={16} />
            Lista ({orders.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <span className="spinner" style={{ margin: '0 auto 1rem auto' }}></span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Buscando entregas ativas...</p>
        </div>
      ) : orders.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.01)',
          border: '1px dashed rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '4rem 2rem',
          color: 'var(--text-secondary)',
          textAlign: 'center'
        }}>
          <Navigation size={42} style={{ margin: '0 auto 1rem auto', opacity: 0.6, color: 'var(--primary-gold)' }} />
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#fff', fontSize: '1.1rem' }}>Nenhuma Entrega em Andamento</h4>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>Os entregadores estão aguardando novos pedidos na pastelaria.</p>
        </div>
      ) : (
        <>
          {/* Aba do Mapa Geral */}
          {activeTab === 'map' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ 
                position: 'relative', 
                width: '100%', 
                height: '520px', 
                borderRadius: '16px', 
                overflow: 'hidden', 
                border: '1px solid rgba(255,255,255,0.08)', 
                zIndex: 1 
              }}>
                <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0.5rem 0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>🏠 Dona Lu Pastelaria</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>🏍️ Entregador Ativo</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>📍 Destino do Pedido</span>
              </div>
            </div>
          )}

          {/* Aba da Lista de Pedidos */}
          {activeTab === 'list' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
              {orders.map((order) => (
                <div key={order.id} style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#fff', fontSize: '1rem' }}>
                      Seq {order.dailySeq || '---'} (#{order.id?.slice(-4).toUpperCase()})
                    </strong>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: 'var(--primary-gold)'
                    }}>
                      Em Rota
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#e5e7eb' }}>
                      <User size={14} style={{ color: 'var(--primary-gold)' }} />
                      <strong>Entregador:</strong> {order.deliveryName || 'Desconhecido'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <MapPin size={14} />
                      <strong>Destino:</strong> {order.address?.street}, {order.address?.number}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Clock size={14} />
                      <strong>Tempo decorrido:</strong> {formatTimeElapsed(order.createdAt)}
                    </span>
                  </div>

                  <div style={{ 
                    marginTop: 'auto', 
                    paddingTop: '0.85rem', 
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.85rem'
                  }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Total do Pedido:
                    </span>
                    <strong style={{ color: 'var(--primary-gold)', fontSize: '0.95rem' }}>
                      R$ {order.total.toFixed(2).replace('.', ',')}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
