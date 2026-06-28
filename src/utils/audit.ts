import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

interface LogAuditParams {
  userId: string;
  userEmail: string;
  userName: string;
  actionType: string;
  title: string;
  description: string;
}

export const logAuditAction = async (params: LogAuditParams) => {
  try {
    const logsRef = collection(db, 'audit_logs');
    await addDoc(logsRef, {
      ...params,
      timestamp: serverTimestamp ? serverTimestamp() : new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao registrar log de auditoria:', error);
  }
};
