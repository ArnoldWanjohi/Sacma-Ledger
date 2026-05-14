export type UserRole = 'member' | 'treasurer';

export interface UserProfile {
  uid: string;
  memberId: string;
  email: string;
  displayName: string;
  role: UserRole;
  balance: number;
  totalDebt: number;
  phoneNumber?: string;
  nationalId?: string;
  department?: string;
  address?: string;
  createdAt: any;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'dividend' | 'interest' | 'general';
  value?: number;
  createdAt: any;
  authorUid: string;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: 'contribution' | 'loan_payment' | 'fine' | 'debt_addition';
  description: string;
  status: 'pending' | 'completed' | 'rejected';
  timestamp: any;
  receiptUrl?: string;
}

export interface Loan {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  repaymentTotal?: number;
  termMonths?: number;
}

export interface SaccoSettings {
  dividendRate: number;
  loanInterestRate: number;
  fineAmount: number;
  fineGracePeriodMinutes: number;
  lastFineRunTimestamp?: any;
  lastUpdated: any;
}

export interface SaccoNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'fine';
  read: boolean;
  createdAt: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}
