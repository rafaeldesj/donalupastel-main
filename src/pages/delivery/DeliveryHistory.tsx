import { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, where, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import type { OrderDocument } from '../../types/order';
import {
  CheckCircle, Calendar, MapPin, DollarSign, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, Search, User, Truck, X
} from 'lucide-react';

type SortField = 'createdAt' | 'deliveredAt' | 'total' | 'clientName' | 'deliveryName';
type SortDir = 'asc' | 'desc';

const isAdminRole = (role: string) =>
  ['developer', 'owner', 'manager'].includes(role);

export const DeliveryHistory = () => {
  const { user, userData } = useAuth();
  const role = userData?.role || '';

  const [allOrders, setAllOrders] = useState<OrderDocument[]>([]);
  const [deliverers, setDeliverers] = useState<{ uid: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterDeliverer, setFilterDeliverer] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'cancelled'>('all');

  // Ordenação
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const isAdmin = isAdminRole(role);

  // Carrega entregadores (somente admin)
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, (snap) => {
      const list: { uid: string; name: string }[] = [];
      snap.forEach((d) => {
        const u = d.data();
        if (u.staffFunctions?.delivery === true || u.role === 'staff') {
          list.push({ uid: d.id, name: u.name || u.displayName || u.email || d.id });
        }
      });
      setDeliverers(list);
    });
    return () => unsub();
  }, [isAdmin]);

  // Carrega pedidos finalizados
  useEffect(() => {
    if (!user) return;

    let q;
    if (isAdmin) {
      // Admins vêem TODAS as entregas finalizadas (status completed ou cancelled com deliveryUid)
      q = query(
        collection(db, 'orders'),
        where('orderType', '==', 'delivery'),
        orderBy('createdAt', 'desc')
      );
    } else {
      // Entregador vê apenas as suas
      q = query(
        collection(db, 'orders'),
        where('deliveryUid', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      const fetched: OrderDocument[] = [];
      snap.forEach((d) => {
        const data = d.data() as OrderDocument;
        // Filtra apenas pedidos que chegaram a ter entregador e foram finalizados
        if (data.status === 'completed' || (data.status === 'cancelled' && data.deliveryUid)) {
          fetched.push({ id: d.id, ...data });
        }
      });
      setAllOrders(fetched);
      setLoading(false);
    }, (err) => {
      console.error('Erro ao carregar histórico:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user, isAdmin]);

  // Aplica filtros + ordenação
  const filtered = useMemo(() => {
    let list = [...allOrders];

    if (filterStatus !== 'all') {
      list = list.filter(o => o.status === filterStatus);
    }

    if (filterDeliverer) {
      list = list.filter(o => o.deliveryUid === filterDeliverer);
    }

    if (filterClient.trim()) {
      const term = filterClient.trim().toLowerCase();
      list = list.filter(o => o.clientName?.toLowerCase().includes(term));
    }

    if (filterDateFrom) {
      const from = new Date(filterDateFrom + 'T00:00:00');
      list = list.filter(o => new Date(o.createdAt) >= from);
    }

    if (filterDateTo) {
      const to = new Date(filterDateTo + 'T23:59:59');
      list = list.filter(o => new Date(o.createdAt) <= to);
    }

    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';

      switch (sortField) {
        case 'createdAt':
          va = new Date(a.createdAt).getTime();
          vb = new Date(b.createdAt).getTime();
          break;
        case 'deliveredAt':
          va = new Date(a.deliveredAt || a.createdAt).getTime();
          vb = new Date(b.deliveredAt || b.createdAt).getTime();
          break;
        case 'total':
          va = a.total;
          vb = b.total;
          break;
        case 'clientName':
          va = a.clientName?.toLowerCase() || '';
          vb = b.clientName?.toLowerCase() || '';
          break;
        case 'deliveryName':
          va = a.deliveryName?.toLowerCase() || '';
          vb = b.deliveryName?.toLowerCase() || '';
          break;
      }

      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [allOrders, filterDeliverer, filterClient, filterDateFrom, filterDateTo, filterStatus, sortField, sortDir]);

  const totalValue = filtered.reduce((s, o) => s + (o.total || 0), 0);
  const totalCompleted = filtered.filter(o => o.status === 'completed').length;
  const totalCancelled = filtered.filter(o => o.status === 'cancelled').length;

  const formatDate = (str?: string) => {
    if (!str) return '—';
    try {
      return new Date(str).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return str; }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={13} style={{ opacity: 0.4 }} />;
    return sortDir === 'asc'
      ? <ArrowUp size={13} style={{ color: 'var(--primary-gold)' }} />
      : <ArrowDown size={13} style={{ color: 'var(--primary-gold)' }} />;
  };

  const clearFilters = () => {
    setFilterDeliverer('');
    setFilterClient('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterStatus('all');
  };

  const hasFilters = filterDeliverer || filterClient || filterDateFrom || filterDateTo || filterStatus !== 'all';

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        <span className="spinner" style={{ display: 'inline-block', marginBottom: '1rem' }} />
        <p>Carregando histórico de entregas...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-layout animate-fade-in">
      {/* Header */}
      <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Entregas Finalizadas 📋</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            {isAdmin ? 'Histórico completo de todas as entregas da pastelaria.' : 'Seu histórico de entregas concluídas.'}
          </p>
        </div>

        {/* Cards de Resumo */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: '#10b98120', padding: '0.5rem', borderRadius: '8px', color: '#10b981' }}>
              <DollarSign size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total (filtrado)</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34d399' }}>
                R$ {totalValue.toFixed(2).replace('.', ',')}
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: '#3b82f620', padding: '0.5rem', borderRadius: '8px', color: '#60a5fa' }}>
              <Truck size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Concluídas</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#60a5fa' }}>{totalCompleted}</div>
            </div>
          </div>

          {isAdmin && totalCancelled > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: '#ef444420', padding: '0.5rem', borderRadius: '8px', color: '#f87171' }}>
                <X size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Canceladas</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f87171' }}>{totalCancelled}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="admin-card-box" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Filter size={16} style={{ color: 'var(--primary-gold)' }} />
          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Filtros e Ordenação</h4>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              style={{
                marginLeft: 'auto',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171',
                borderRadius: '8px',
                padding: '0.3rem 0.75rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {/* Filtro por entregador (só admin) */}
          {isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Truck size={12} /> Entregador
              </label>
              <select
                value={filterDeliverer}
                onChange={e => setFilterDeliverer(e.target.value)}
                style={{
                  background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none'
                }}
              >
                <option value="">Todos os entregadores</option>
                {deliverers.map(d => (
                  <option key={d.uid} value={d.uid}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Filtro por cliente */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <User size={12} /> Cliente
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Buscar por nome..."
                value={filterClient}
                onChange={e => setFilterClient(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', padding: '0.5rem 0.75rem 0.5rem 2rem', fontSize: '0.875rem', outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Filtro por status */}
          {isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <CheckCircle size={12} /> Status
              </label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as any)}
                style={{
                  background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none'
                }}
              >
                <option value="all">Todos</option>
                <option value="completed">✅ Concluídas</option>
                <option value="cancelled">❌ Canceladas (com entregador)</option>
              </select>
            </div>
          )}

          {/* Data de */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Calendar size={12} /> De (data)
            </label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              style={{
                background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none',
                colorScheme: 'dark'
              }}
            />
          </div>

          {/* Data até */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Calendar size={12} /> Até (data)
            </label>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              style={{
                background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none',
                colorScheme: 'dark'
              }}
            />
          </div>

          {/* Ordenar por */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <ArrowUpDown size={12} /> Ordenar por
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <select
                value={sortField}
                onChange={e => setSortField(e.target.value as SortField)}
                style={{
                  flex: 1, background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', padding: '0.5rem 0.5rem', fontSize: '0.875rem', outline: 'none'
                }}
              >
                <option value="createdAt">Data do Pedido</option>
                <option value="deliveredAt">Data de Entrega</option>
                <option value="clientName">Nome do Cliente</option>
                {isAdmin && <option value="deliveryName">Nome do Entregador</option>}
                <option value="total">Valor Total</option>
              </select>
              <button
                type="button"
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                title={sortDir === 'asc' ? 'Crescente' : 'Decrescente'}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', padding: '0.5rem 0.6rem', cursor: 'pointer', color: 'var(--primary-gold)',
                  display: 'flex', alignItems: 'center'
                }}
              >
                {sortDir === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Resultados */}
      <div className="admin-card-box">
        <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
          <CheckCircle size={20} style={{ color: '#10b981' }} />
          Registro de Entregas
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
            {filtered.length} {filtered.length === 1 ? 'entrega encontrada' : 'entregas encontradas'}
            {hasFilters && allOrders.length !== filtered.length && ` (de ${allOrders.length} no total)`}
          </span>
        </h3>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Truck size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <p style={{ margin: 0 }}>
              {hasFilters
                ? 'Nenhuma entrega encontrada com os filtros aplicados.'
                : 'Nenhuma entrega finalizada encontrada ainda.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
            <table className="admin-table" style={{ fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th
                    onClick={() => toggleSort('createdAt')}
                    style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Data/Hora <SortIcon field="createdAt" />
                    </span>
                  </th>
                  <th>Pedido</th>
                  <th
                    onClick={() => toggleSort('clientName')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Cliente <SortIcon field="clientName" />
                    </span>
                  </th>
                  {isAdmin && (
                    <th
                      onClick={() => toggleSort('deliveryName')}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        Entregador <SortIcon field="deliveryName" />
                      </span>
                    </th>
                  )}
                  <th>Endereço</th>
                  <th>Status</th>
                  <th
                    onClick={() => toggleSort('total')}
                    style={{ cursor: 'pointer', textAlign: 'right', userSelect: 'none' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                      Total <SortIcon field="total" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
                        <Calendar size={13} style={{ color: 'var(--primary-gold)', flexShrink: 0 }} />
                        {formatDate(order.createdAt)}
                      </span>
                      {order.deliveredAt && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#10b981', marginTop: '0.2rem' }}>
                          <CheckCircle size={11} />
                          Entregue: {formatDate(order.deliveredAt)}
                        </span>
                      )}
                    </td>

                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {order.dailySeq
                        ? `Pedido #${order.dailySeq}`
                        : `#${order.id?.slice(-4).toUpperCase()}`}
                    </td>

                    <td>
                      <div style={{ fontWeight: 500 }}>{order.clientName}</div>
                      {order.clientPhone && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{order.clientPhone}</div>
                      )}
                    </td>

                    {isAdmin && (
                      <td>
                        {order.deliveryName ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Truck size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />
                            {order.deliveryName}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    )}

                    <td>
                      {order.address ? (
                        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                          <MapPin size={13} style={{ flexShrink: 0, color: '#3b82f6', marginTop: '0.1rem' }} />
                          <span>
                            {order.address.street}, {order.address.number}
                            {order.address.complement ? ` (${order.address.complement})` : ''}
                            <br />
                            <span style={{ fontSize: '0.78rem' }}>{order.address.neighborhood}</span>
                          </span>
                        </span>
                      ) : '—'}
                    </td>

                    <td>
                      {order.status === 'completed' ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          background: 'rgba(16,185,129,0.1)', color: '#10b981',
                          borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 600
                        }}>
                          <CheckCircle size={11} /> Concluída
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          background: 'rgba(239,68,68,0.1)', color: '#f87171',
                          borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 600
                        }}>
                          <X size={11} /> Cancelada
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 700, color: order.status === 'completed' ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
                      R$ {order.total.toFixed(2).replace('.', ',')}
                      {order.deliveryFee ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                          + R$ {order.deliveryFee.toFixed(2).replace('.', ',')} frete
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Rodapé com totais */}
              {filtered.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid rgba(255,255,255,0.08)' }}>
                    <td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.85rem', paddingTop: '0.75rem' }}>
                      Total das {filtered.length} entregas:
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#34d399', fontSize: '1rem', paddingTop: '0.75rem', whiteSpace: 'nowrap' }}>
                      R$ {totalValue.toFixed(2).replace('.', ',')}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryHistory;
