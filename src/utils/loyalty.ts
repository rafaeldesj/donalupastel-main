import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Processa o acúmulo e resgate de carimbos fidelidade do cliente ao finalizar um pedido.
 * Garante que apenas pastéis (doces/salgados) sejam contabilizados.
 * Desconta os carimbos caso tenha sido feito resgate de fidelidade.
 * O pastel resgatado de graça não soma carimbos novos.
 * Previne dupla contabilização usando uma transação e a tag 'loyaltyProcessed' no pedido.
 */
export const processOrderLoyaltyStamps = async (orderId: string, orderData: any) => {
  if (!orderId || !orderData || !orderData.clientUid || orderData.loyaltyProcessed) {
    return;
  }

  // Apenas processa se o status for 'completed'
  if (orderData.status !== 'completed') {
    return;
  }

  try {
    const userDocRef = doc(db, 'users', orderData.clientUid);
    const orderDocRef = doc(db, 'orders', orderId);

    await runTransaction(db, async (transaction) => {
      const orderSnap = await transaction.get(orderDocRef);
      if (!orderSnap.exists()) return;

      const currentOrder = orderSnap.data();
      if (currentOrder.loyaltyProcessed || currentOrder.status !== 'completed') return;

      const userSnap = await transaction.get(userDocRef);
      let currentStamps = 0;
      if (userSnap.exists()) {
        currentStamps = userSnap.data().loyaltyStamps || 0;
      }

      // Contabilizar pastéis doces e salgados no pedido
      let totalPastels = 0;
      const items = currentOrder.items || [];
      items.forEach((item: any) => {
        const nameLower = (item.name || '').toLowerCase();
        const isPastel = 
          item.category === 'Pastéis Salgados' || 
          item.category === 'Pastéis Doces' ||
          nameLower.includes('pastel') || 
          nameLower.includes('ninho') || 
          nameLower.includes('kitkat') || 
          nameLower.includes('banana') || 
          nameLower.includes('morango') || 
          nameLower.includes('carne') || 
          nameLower.includes('queijo') || 
          nameLower.includes('frango') || 
          nameLower.includes('bacon') || 
          nameLower.includes('calabresa') || 
          nameLower.includes('palmito');

        if (isPastel) {
          totalPastels += (item.quantity || 1);
        }
      });

      let stampsToAdd = totalPastels;
      let stampsToSubtract = 0;

      if (currentOrder.usedFidelityRescue) {
        // 1 pastel foi de graça (resgate), então não pontua
        stampsToAdd = Math.max(0, totalPastels - 1);
        // Consome 10 carimbos do cartão fidelidade do cliente
        stampsToSubtract = 10;
      }

      const newStamps = Math.max(0, currentStamps - stampsToSubtract + stampsToAdd);

      // 1. Atualizar o saldo de carimbos do usuário
      transaction.update(userDocRef, { 
        loyaltyStamps: newStamps,
        updatedAt: new Date().toISOString()
      });

      // 2. Marcar o pedido como processado pelo programa de fidelidade
      transaction.update(orderDocRef, { 
        loyaltyProcessed: true,
        updatedAt: new Date().toISOString()
      });
    });

    console.log(`Loyalty stamps processed successfully for order ${orderId}`);
  } catch (err) {
    console.error("Erro ao processar carimbos de fidelidade na transação:", err);
  }
};
