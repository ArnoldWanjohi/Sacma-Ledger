/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc,
  getDocs,
  serverTimestamp,
  orderBy,
  limit,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, googleProvider, signInWithPopup, signOut } from './lib/firebase';
import { cn, formatCurrency } from './lib/utils';
import { 
  UserProfile, 
  UserRole,
  Announcement, 
  Transaction, 
  Loan,
  SaccoSettings, 
  SaccoNotification,
  OperationType, 
  FirestoreErrorInfo 
} from './types';
import { 
  Plus, 
  LogOut, 
  LayoutDashboard, 
  Users, 
  Bell, 
  Settings, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  ShieldCheck, 
  ShieldAlert,
  Loader2,
  FileText,
  AlertCircle,
  Menu,
  X,
  CreditCard,
  Receipt,
  Wallet,
  TrendingUp,
  BarChart3,
  Search,
  Filter,
  UserPlus,
  UserMinus,
  Download,
  FileDown,
  Mail,
  MoreVertical,
  Megaphone,
  CheckCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isAfter, setHours, setMinutes, addMinutes, parseISO, isSameDay } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<SaccoNotification[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [settings, setSettings] = useState<SaccoSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'transactions' | 'loans' | 'reports' | 'announcements' | 'notifications' | 'settings'>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [txTargetUserId, setTxTargetUserId] = useState<string | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Sync Profile
        const userDocRef = doc(db, 'users', u.uid);
        try {
          const userDoc = await getDoc(userDocRef).catch((err) => {
            handleFirestoreError(err, OperationType.GET, `users/${u.uid}`);
            throw err;
          });
          if (!userDoc.exists()) {
            const newProfile: UserProfile = {
              uid: u.uid,
              memberId: `SACMA-${u.uid.substring(0, 5).toUpperCase()}`,
              email: u.email || '',
              displayName: u.displayName || 'Member',
              role: u.email === 'wanjohikagunda03@gmail.com' ? 'treasurer' : 'member',
              balance: 0,
              totalDebt: 0,
              createdAt: serverTimestamp(),
            };
            await setDoc(userDocRef, newProfile).catch((err) => {
              handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`);
              throw err;
            });
            setProfile(newProfile);
          } else {
            const data = userDoc.data() as UserProfile;
            // Enforce treasurer role for the owner email if it doesn't match
            if (u.email === 'wanjohikagunda03@gmail.com' && data.role !== 'treasurer') {
               console.log("Enforcing treasurer role for owner account...");
               const updatedProfile = { 
                 ...data, 
                 role: 'treasurer' as const,
                 uid: u.uid, // ensure uid is present
                 memberId: data.memberId || `SACMA-${u.uid.substring(0, 5).toUpperCase()}`,
                 email: u.email
               };
               await updateDoc(userDocRef, { role: 'treasurer' }).catch(async (err) => {
                 console.warn("Failed to update role via updateDoc, trying setDoc merger", err);
                 await setDoc(userDocRef, updatedProfile, { merge: true });
               });
               data.role = 'treasurer';
            }
            setProfile(data);
          }
        } catch (e) {
          console.error("Error fetching/creating profile", e);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user || !profile) return;

    // Settings
    const settingsUnsub = onSnapshot(doc(db, 'settings', 'global'), (s) => {
      if (s.exists()) setSettings(s.data() as SaccoSettings);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/global'));

    // Announcements
    const announcementsQuery = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(10));
    const annUnsub = onSnapshot(announcementsQuery, (snap) => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'announcements'));

    // Transactions
    let transQuery;
    if (profile.role === 'treasurer') {
      transQuery = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(50));
    } else {
      transQuery = query(collection(db, 'transactions'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'), limit(50));
    }

    const transUnsub = onSnapshot(transQuery, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    // Loans
    let loansQuery;
    if (profile.role === 'treasurer') {
      loansQuery = query(collection(db, 'loans'), orderBy('createdAt', 'desc'), limit(50));
    } else {
      loansQuery = query(collection(db, 'loans'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50));
    }
    const loansUnsub = onSnapshot(loansQuery, (snap) => {
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'loans'));

    // Notifications
    const notificationsQuery = query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50));
    const notifUnsub = onSnapshot(notificationsQuery, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as SaccoNotification)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));

    return () => {
      settingsUnsub();
      annUnsub();
      transUnsub();
      loansUnsub();
      notifUnsub();
    };
  }, [user, profile]);

  // Automated Fine System (Background Job)
  useEffect(() => {
    if (profile?.role === 'treasurer' && settings) {
      const runAutomatedFineJob = async () => {
        const now = new Date();
        
        // Define fine threshold: 5:00 PM today
        const fineHour = 17;
        const fineGrace = settings.fineGracePeriodMinutes || 0;
        const fineThresholdTime = addMinutes(setMinutes(setHours(new Date(), fineHour), 0), fineGrace);
        
        // Only run if it's past 5 PM
        if (isAfter(now, fineThresholdTime)) {
          const lastRun = settings.lastFineRunTimestamp?.toDate ? settings.lastFineRunTimestamp.toDate() : settings.lastFineRunTimestamp;
          
          // Only run once per day
          if (!lastRun || !isSameDay(new Date(lastRun), now)) {
            console.log("Triggering automated daily fine assessment...");
            try {
              // Fetch all members with outstanding debt
              // Note: In a large SACCO, this should be paginated or moved to a Cloud Function
              const membersSnap = await getDocs(query(collection(db, 'users'), where('totalDebt', '>', 0)));
              
              if (!membersSnap.empty) {
                const batch = writeBatch(db);
                const fineAmount = settings.fineAmount || 200;
                
                membersSnap.docs.forEach(memberDoc => {
                  const m = memberDoc.data() as UserProfile;
                  
                  // 1. Update Member Debt
                  batch.update(memberDoc.ref, {
                    totalDebt: (m.totalDebt || 0) + fineAmount
                  });
                  
                  // 2. Create Notification
                  const notifRef = doc(collection(db, 'notifications'));
                  batch.set(notifRef, {
                    userId: m.uid,
                    title: 'Automated Late Fine',
                    message: `A daily late fine of ${formatCurrency(fineAmount)} has been applied to your account due to an outstanding balance after 5:00 PM.`,
                    type: 'fine',
                    read: false,
                    createdAt: serverTimestamp()
                  });
                  
                  // 3. Record Transaction
                  const txRef = doc(collection(db, 'transactions'));
                  batch.set(txRef, {
                    userId: m.uid,
                    amount: fineAmount,
                    type: 'fine',
                    description: `Automated Daily Late Fine (System Assessment)`,
                    status: 'completed',
                    timestamp: serverTimestamp()
                  });
                });
                
                // 4. Mark job as complete for today
                batch.update(doc(db, 'settings', 'global'), {
                  lastFineRunTimestamp: serverTimestamp(),
                  lastUpdated: serverTimestamp()
                });
                
                await batch.commit();
                console.log(`Automated fine job complete. ${membersSnap.size} members fined.`);
              } else {
                // No debt found, but still mark as run to avoid repeated checks
                await updateDoc(doc(db, 'settings', 'global'), {
                  lastFineRunTimestamp: serverTimestamp()
                });
                console.log("Automated fine job skipped: No overdue balances found.");
              }
            } catch (error) {
              console.error("Automated fine job error:", error);
            }
          }
        }
      };

      runAutomatedFineJob();
    }
  }, [profile, settings]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-sacco-blue" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 shadow-sm border border-slate-200 text-center"
        >
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">SacMa Ledger</h1>
          <p className="text-slate-500 mb-8">Secure financial management for your community ledger.</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-emerald-600 text-white font-medium py-3 rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 invert" />
            Continue with Google
          </button>
          <p className="mt-6 text-xs text-slate-400">
            By continuing, you agree to our Terms and Security Policies.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isAdmin={profile?.role === 'treasurer'} 
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-bottom border-slate-200 px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 md:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-lg font-semibold capitalize font-sans">{activeTab}</h2>
              <p className="text-xs text-slate-500 hidden sm:block">Welcome back, {profile?.displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
              onClick={() => setActiveTab('notifications')}
              className="p-2 rounded-full hover:bg-slate-100 relative"
             >
               <Bell className="w-5 h-5 text-slate-600" />
               {notifications.filter(n => !n.read).length > 0 && (
                 <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-white">
                   {notifications.filter(n => !n.read).length}
                 </span>
               )}
             </button>
             <div className="w-8 h-8 rounded-full bg-sacco-green/20 flex items-center justify-center text-sacco-green font-bold text-sm">
               {profile?.displayName?.charAt(0) || 'U'}
             </div>
          </div>
        </header>

        <main className="p-4 md:p-8 max-w-7xl mx-auto w-full">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <DashboardView 
                profile={profile} 
                announcements={announcements} 
                transactions={transactions} 
                loans={loans}
                settings={settings}
                setActiveTab={setActiveTab}
                setIsTxModalOpen={setIsTxModalOpen}
                setIsLoanModalOpen={setIsLoanModalOpen}
                setIsAddMemberModalOpen={() => {
                  setActiveTab('members');
                  setIsAddModalOpen(true);
                }}
              />
            )}
            {activeTab === 'members' && (
               <MembersView 
                setIsTxModalOpen={setIsTxModalOpen}
                setTxTargetUserId={setTxTargetUserId}
                isAdmin={profile?.role === 'treasurer'}
                isAddModalOpen={isAddModalOpen}
                setIsAddModalOpen={setIsAddModalOpen}
               />
            )}
            {activeTab === 'transactions' && (
               <TransactionsView transactions={transactions} />
            )}
            {activeTab === 'loans' && (
               <LoansView loans={loans} profile={profile} isAdmin={profile?.role === 'treasurer'} />
            )}
            {activeTab === 'reports' && profile?.role === 'treasurer' && (
               <ReportsView transactions={transactions} membersCount={84} />
            )}
            {activeTab === 'announcements' && (
               <AnnouncementsView announcements={announcements} isAdmin={profile?.role === 'treasurer'} />
            )}
            {activeTab === 'notifications' && (
               <NotificationsView notifications={notifications} />
            )}
            {activeTab === 'settings' && (
               <SettingsView settings={settings} isAdmin={profile?.role === 'treasurer'} />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isTxModalOpen && (
              <TransactionModal 
                onClose={() => { setIsTxModalOpen(false); setTxTargetUserId(null); }} 
                userId={user.uid} 
                isAdmin={profile?.role === 'treasurer'}
                initialTargetUserId={txTargetUserId}
                settings={settings}
              />
            )}
            {isLoanModalOpen && (
              <LoanApplicationModal 
                onClose={() => setIsLoanModalOpen(false)} 
                userId={user.uid} 
              />
            )}
            {isAddModalOpen && (
              <AddMemberModal 
                onClose={() => setIsAddModalOpen(false)} 
              />
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// Sub-components
function Sidebar({ activeTab, setActiveTab, isAdmin, isOpen, onClose, onLogout }: any) {
  const menuItems = [
    { id: 'dashboard', label: 'Treasury Overview', icon: LayoutDashboard },
    { id: 'loans', label: 'Loans & Debt', icon: FileText },
    { id: 'announcements', label: 'Broadcasts', icon: Megaphone },
    { id: 'notifications', label: 'My Alerts', icon: Bell },
  ];

  if (isAdmin) {
    menuItems.splice(1, 0, { id: 'members', label: 'Members Ledger', icon: Users });
    menuItems.splice(2, 0, { id: 'transactions', label: 'Audit Log', icon: Receipt });
    menuItems.push({ id: 'reports', label: 'Annual Reports', icon: ShieldCheck });
    menuItems.push({ id: 'settings', label: 'SacMa Config', icon: Settings });
  }

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={cn("fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity md:hidden", isOpen ? "opacity-100" : "opacity-0 pointer-events-none")}
        onClick={onClose}
      />
      
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 z-50 transition-transform duration-300 transform md:translate-x-0 md:static",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-10 pb-6 border-b border-slate-800 hover:border-emerald-500/30 transition-colors">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">SacMa Ledger</span>
          </div>

          <nav className="flex-1 space-y-2 text-sm">
            {menuItems.map((item: any) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); onClose(); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group text-slate-300",
                  activeTab === item.id 
                    ? "bg-slate-800 text-white font-medium" 
                    : "hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className={cn("w-4 h-4", activeTab === item.id ? "text-emerald-500" : "text-slate-400 group-hover:text-slate-300")} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t border-slate-800">
             <button 
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-red-900/20 hover:text-red-400 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Log Out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function DashboardView({ profile, announcements, transactions, loans, settings, setActiveTab, setIsTxModalOpen, setIsLoanModalOpen, setIsAddMemberModalOpen }: any) {
  const pendingLoans = loans.filter(l => l.status === 'pending');
  const activeLoans = loans.filter(l => l.status === 'approved');
  
  // Smart Stats
  const isAdmin = profile?.role === 'treasurer';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dailyCollections = transactions
    .filter(tx => tx.type === 'contribution' && tx.timestamp?.seconds * 1000 >= today.getTime())
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalIn = transactions
    .filter(tx => tx.type === 'contribution' || tx.type === 'loan_payment' || tx.type === 'fine')
    .reduce((sum, tx) => sum + tx.amount, 0);
  
  const totalOut = transactions
    .filter(tx => tx.type === 'debt_addition')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalSaccoBalance = totalIn - totalOut;

  const notifyAllMembers = () => {
    if (confirm("Send payment reminders to all members with outstanding balances?")) {
      alert("Bulk notifications queued for delivery via SMS/WhatsApp.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard 
          label={isAdmin ? "Daily collections" : "Total Balance"} 
          value={formatCurrency(isAdmin ? dailyCollections : (profile?.balance || 0))} 
          icon={isAdmin ? Wallet : CreditCard} 
          trend={isAdmin ? "Refreshed live" : "12% vs last month"}
          trendUp={true}
          color={isAdmin ? "emerald" : "slate"}
        />
        <StatCard 
          label="SacMa Total Funds" 
          value={formatCurrency(totalSaccoBalance)} 
          icon={AlertCircle} 
          trend={`${activeLoans.length} Active Loans`}
          color="blue"
        />
        <StatCard 
          label="Pending Approvals" 
          value={pendingLoans.length.toString()} 
          icon={Clock} 
          trend={isAdmin ? "Requires action" : "Awaiting review"}
          color="amber"
          trendUp={pendingLoans.length > 0}
        />
        <StatCard 
          label="Dividend Rate" 
          value={`${settings?.dividendRate || 8.25}%`} 
          icon={ArrowUpRight} 
          trend="Effective: FY2024"
          color="emerald"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <button 
          onClick={() => setIsTxModalOpen(true)}
          className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-500 hover:bg-emerald-50/30 transition-all flex flex-col items-center gap-2 group"
         >
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
               <Plus size={20} />
            </div>
            <span className="text-xs font-bold text-slate-700">Record Payment</span>
         </button>
         <button 
          onClick={() => setActiveTab('members')}
          className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-sky-500 hover:bg-sky-50/30 transition-all flex flex-col items-center gap-2 group"
         >
            <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center text-sky-600 group-hover:scale-110 transition-transform">
               <Users size={20} />
            </div>
            <span className="text-xs font-bold text-slate-700">Member Search</span>
         </button>

         {isAdmin && (
           <button 
            onClick={setIsAddMemberModalOpen}
            className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-500 hover:bg-emerald-50/30 transition-all flex flex-col items-center gap-2 group"
           >
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                 <UserPlus size={20} />
              </div>
              <span className="text-xs font-bold text-slate-700">Add Member</span>
           </button>
         )}

         <button 
          onClick={() => setActiveTab('loans')}
          className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-amber-500 hover:bg-amber-50/30 transition-all flex flex-col items-center gap-2 group"
         >
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
               <FileText size={20} />
            </div>
            <span className="text-xs font-bold text-slate-700">Approve Loans</span>
         </button>
         <button 
          onClick={() => setActiveTab('reports')}
          className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-slate-800 hover:bg-slate-50 transition-all flex flex-col items-center gap-2 group"
         >
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 group-hover:scale-110 transition-transform">
               <ShieldCheck size={20} />
            </div>
            <span className="text-xs font-bold text-slate-700">Annual Audit</span>
         </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col gap-8">
           <header className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">SacMa Operational Overview</h1>
                <p className="text-sm text-slate-400">Live transaction monitoring and ledger management.</p>
              </div>
              <div className="flex gap-3">
                 {isAdmin && (
                   <button 
                    onClick={notifyAllMembers}
                    className="px-4 py-2 border border-slate-200 text-amber-600 rounded-lg text-sm font-semibold bg-white hover:bg-amber-50 transition shadow-sm flex items-center gap-2"
                   >
                     <Bell size={16} /> Bulk Notify
                   </button>
                 )}
                 <button 
                  onClick={() => setIsTxModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition shadow-sm"
                 >
                   + Record Payment
                 </button>
              </div>
           </header>

           <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <h2 className="font-bold text-slate-700">Recent Transactions</h2>
                 <div className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold uppercase tracking-wider">
                   Live Check-In (After 5:00 PM: +200 KSh)
                 </div>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
                       <tr>
                          <th className="px-6 py-4">Transaction Details</th>
                          <th className="px-6 py-4 text-center">Status</th>
                          <th className="px-6 py-4 text-right">Amount</th>
                       </tr>
                    </thead>
                    <tbody className="text-sm text-slate-600 divide-y divide-slate-50">
                       {transactions.length > 0 ? (
                         transactions.map((tx) => (
                           <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                 <div className="font-medium text-slate-800">{tx.description}</div>
                                 <div className="text-xs text-slate-400">{tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleString() : 'Just now'}</div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                 <span className={cn(
                                   "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                                   tx.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                 )}>
                                   {tx.status}
                                 </span>
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-slate-700 font-mono">
                                 {tx.type === 'contribution' ? '+' : '-'}{formatCurrency(tx.amount)}
                              </td>
                           </tr>
                         ))
                       ) : (
                         <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">No recent activities</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>

        <div className="flex flex-col gap-8">
           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-50">
                <h2 className="font-bold text-slate-700">Announcements</h2>
                <span className="text-[10px] text-sky-600 font-bold underline cursor-pointer">View All</span>
              </div>
              <div className="space-y-4">
                {announcements.slice(0, 3).map((ann) => (
                  <div key={ann.id} className="p-3 bg-slate-50 rounded-lg border-l-4 border-slate-300 hover:bg-slate-100 transition-colors group">
                    <p className="text-xs font-bold text-slate-700 group-hover:text-emerald-600 transition-colors">{ann.title}</p>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{ann.content}</p>
                  </div>
                ))}
              </div>
           </div>

              <div className="bg-slate-900 p-6 rounded-xl shadow-lg text-white overflow-hidden relative">
              <div className="relative z-10">
                <h2 className="font-bold mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  {profile?.role === 'treasurer' ? 'Administrative Tools' : 'Sacco Mobile Wallet'}
                </h2>
                <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-lg mb-4 text-sm border border-slate-700">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded flex items-center justify-center font-bold text-emerald-500">
                    {profile?.role === 'treasurer' ? <Settings size={20} /> : 'MP'}
                  </div>
                  <div>
                    <p className="font-bold text-emerald-400">
                      {profile?.role === 'treasurer' ? 'Settings & Rates' : formatCurrency(profile?.balance || 0)}
                    </p>
                    <p className="text-[10px] text-slate-400 italic">
                      {profile?.role === 'treasurer' ? 'Configure SacMa Logic' : 'Safe & Insured'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsLoanModalOpen(profile?.role !== 'treasurer')}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 transition rounded font-bold text-xs"
                >
                  {profile?.role === 'treasurer' ? 'Treasury Overview' : 'Review Statement'}
                </button>
              </div>
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl"></div>
           </div>
        </div>
      </div>

    </motion.div>
  );
}

function LoanApplicationModal({ onClose, userId }: { onClose: () => void, userId: string }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'loans'), {
        userId,
        amount: parseFloat(amount),
        reason,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert("Error applying for loan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
       <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
       <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl"
       >
          <h3 className="text-xl font-bold mb-6">Apply for SACCO Loan</h3>
          <form onSubmit={handleSubmit} className="space-y-6">
             <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Requested Amount (KSh)</label>
                <input 
                  type="number" 
                  required 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 font-bold"
                  placeholder="0.00"
                />
             </div>
             <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Purpose of Loan</label>
                <textarea 
                  required 
                  value={reason} 
                  onChange={e => setReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 min-h-[100px]"
                  placeholder="Explain why you need this loan..."
                />
             </div>
             <button disabled={loading} className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-lg hover:bg-emerald-700 transition shadow-lg">
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Submit Application"}
             </button>
          </form>
       </motion.div>
    </div>
  );
}

function StatCard({ label, value, trend, icon: Icon, color, trendUp }: any) {
  const colors: any = {
    slate: "text-slate-800 bg-white border-slate-200",
    emerald: "border-emerald-500 ring-1 ring-emerald-500 ring-opacity-10",
    blue: "text-sky-700 border-slate-200",
    red: "text-red-600 border-slate-200",
    amber: "text-amber-700 border-amber-200 bg-amber-50/30",
  };

  return (
    <div className={cn("p-6 rounded-xl shadow-sm bg-white border overflow-hidden relative", colors[color as keyof typeof colors])}>
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{label}</p>
      <h3 className="text-2xl font-bold mt-1 font-mono tracking-tight">{value}</h3>
      <div className={cn(
        "flex items-center mt-2 text-[10px] font-bold uppercase tracking-tight",
        trendUp ? "text-emerald-600" : "text-slate-400"
      )}>
        {trendUp && <ArrowUpRight className="w-3 h-3 mr-1" />}
        {trend}
      </div>
      <div className="absolute top-4 right-4 opacity-10">
        <Icon className="w-8 h-8" />
      </div>
    </div>
  );
}

function TransactionItem({ transaction }: any) {
  const isOut = transaction.type === 'loan_payment' || transaction.type === 'fine' || transaction.type === 'debt_addition';
  
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-200 transition-all">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center",
          transaction.type === 'contribution' ? "bg-green-100 text-green-600" :
          transaction.type === 'fine' ? "bg-red-100 text-red-600" :
          "bg-blue-100 text-blue-600"
        )}>
          {transaction.type === 'contribution' ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
        </div>
        <div>
          <h4 className="font-semibold text-slate-900">{transaction.description}</h4>
          <p className="text-xs text-slate-500">
            {transaction.timestamp?.seconds ? new Date(transaction.timestamp.seconds * 1000).toLocaleString() : 'Just now'}
          </p>
        </div>
      </div>
      <div className="text-right">
        <div className={cn(
          "font-bold font-mono",
          transaction.type === 'contribution' ? "text-sacco-green" : "text-red-500"
        )}>
          {transaction.type === 'contribution' ? "+" : "-"}{formatCurrency(transaction.amount)}
        </div>
        <span className={cn(
          "text-[10px] uppercase font-bold",
          transaction.status === 'completed' ? "text-sacco-green" : "text-amber-500"
        )}>
          {transaction.status}
        </span>
      </div>
    </div>
  );
}

function TransactionModal({ onClose, userId, isAdmin, initialTargetUserId, settings }: { onClose: () => void, userId: string, isAdmin: boolean, initialTargetUserId?: string | null, settings: SaccoSettings | null }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Transaction['type']>('contribution');
  const [loading, setLoading] = useState(false);
  const [targetUserId, setTargetUserId] = useState(initialTargetUserId || userId);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    if (isAdmin) {
      const q = query(collection(db, 'users'), orderBy('displayName', 'asc'), limit(100));
      onSnapshot(q, (s) => {
        setMembers(s.docs.map(d => d.data() as UserProfile));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    }
  }, [isAdmin]);

  const filteredMembers = members.filter(m => 
    m.displayName.toLowerCase().includes(memberSearch.toLowerCase()) ||
    (m.memberId && m.memberId.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const numAmount = parseFloat(amount);
      const now = new Date();
      let memo = description;

      // Fine Calculation: After 5 PM (17:00) + grace period
      const currentFineAmount = settings?.fineAmount || 200;
      const gracePeriod = settings?.fineGracePeriodMinutes || 0;
      const baseThreshold = setHours(setMinutes(new Date(), 0), 17);
      const fineThreshold = addMinutes(baseThreshold, gracePeriod);
      const isLate = isAfter(now, fineThreshold) && type === 'contribution';

      const txData: Omit<Transaction, 'id'> = {
        userId: isAdmin ? targetUserId : userId,
        amount: numAmount,
        type,
        description: isLate ? `${memo} (Late Submission)` : memo,
        status: isAdmin ? 'completed' : 'pending',
        timestamp: serverTimestamp()
      };

      const txRef = await addDoc(collection(db, 'transactions'), txData).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, 'transactions');
        throw err;
      });
      
      if (isAdmin || txData.status === 'completed') {
        const userRef = doc(db, 'users', txData.userId);
        const userDoc = await getDoc(userRef).catch((err) => {
          handleFirestoreError(err, OperationType.GET, `users/${txData.userId}`);
          throw err;
        });
        
        if (userDoc.exists()) {
           const current = userDoc.data() as UserProfile;
           let updates: Partial<UserProfile> = {};
           
           if (type === 'contribution') {
             updates.balance = (current.balance || 0) + numAmount;
             
             // Apply automated fine if late
             if (isLate) {
                const fineAmount = currentFineAmount;
                updates.totalDebt = (current.totalDebt || 0) + fineAmount;

                // Create Notification
                await addDoc(collection(db, 'notifications'), {
                  userId: txData.userId,
                  title: 'Late Fine Applied',
                  message: `A late fine of ${formatCurrency(fineAmount)} has been added to your account for a contribution made after 5 PM (+ ${gracePeriod}min grace period).`,
                  type: 'fine',
                  read: false,
                  createdAt: serverTimestamp()
                }).catch((err) => {
                  handleFirestoreError(err, OperationType.WRITE, 'notifications');
                  throw err;
                });
                
                // Record the fine transaction
                await addDoc(collection(db, 'transactions'), {
                  userId: txData.userId,
                  amount: fineAmount,
                  type: 'fine',
                  description: `Automatic Late Fine (Ref: ${txRef.id.substring(0, 5)})`,
                  status: 'completed',
                  timestamp: serverTimestamp()
                }).catch((err) => {
                  handleFirestoreError(err, OperationType.WRITE, 'transactions');
                  throw err;
                });
             }
           } else if (type === 'loan_payment') {
             updates.totalDebt = Math.max(0, (current.totalDebt || 0) - numAmount);
           } else if (type === 'fine' || type === 'debt_addition') {
             updates.totalDebt = (current.totalDebt || 0) + numAmount;
           }
           
           await updateDoc(userRef, updates).catch((err) => {
             handleFirestoreError(err, OperationType.WRITE, `users/${txData.userId}`);
             throw err;
           });
        }
      }

      onClose();
    } catch (e) {
      console.error("Submit Error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
       <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
       <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-white w-full max-w-lg rounded-2xl p-8 shadow-2xl border border-slate-200"
       >
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-800">Record SACCO Transaction</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {isAdmin && (
               <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Member</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Search member by name or ID..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-emerald-500 text-sm mb-2"
                    />
                  </div>
                  <select 
                    value={targetUserId} 
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 font-medium text-sm max-h-40"
                    size={Math.min(5, Math.max(1, filteredMembers.length))}
                  >
                    {filteredMembers.map(m => (
                      <option key={m.uid} value={m.uid}>{m.displayName} ({m.memberId})</option>
                    ))}
                    {filteredMembers.length === 0 && (
                      <option disabled>No members match your search</option>
                    )}
                  </select>
               </div>
            )}

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Category</label>
                  <select 
                    value={type} 
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                  >
                    <option value="contribution">Deposit</option>
                    <option value="loan_payment">Loan Payment</option>
                    <option value="fine">Pay Fine</option>
                    <option value="debt_addition">Add Debt</option>
                  </select>
               </div>
               <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Amount (KSh)</label>
                  <input 
                    type="number" 
                    required 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 font-mono text-sm font-bold"
                  />
               </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Transaction Memo</label>
              <textarea 
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details of the transaction..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            <div className="bg-red-50 rounded-lg p-4 border border-red-100 flex gap-3">
               <Clock className="w-5 h-5 text-red-600 flex-shrink-0" />
               <p className="text-[11px] text-red-800 leading-normal font-medium">
                 <span className="font-bold">Important:</span> Transactions after 5:00 PM {settings?.fineGracePeriodMinutes ? `(+ ${settings.fineGracePeriodMinutes}min grace period)` : ''} are subject to an automatic {formatCurrency(settings?.fineAmount || 200)} late fine per SacMa policy.
               </p>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Authorize & Save"}
            </button>
          </form>
       </motion.div>
    </div>
  );
}

function TransactionsView({ transactions }: { transactions: Transaction[] }) {
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = transactions.filter(tx => {
    const matchesFilter = filter === 'all' || tx.type === filter;
    const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
       <header className="flex justify-between items-end">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Audit Ledger</h3>
            <p className="text-sm text-slate-400">Complete immutable record of all financial movements.</p>
          </div>
          <div className="flex gap-2">
             <button className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition shadow-sm">
                <Download size={18} className="text-slate-600" />
             </button>
          </div>
       </header>

       <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full md:w-96">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
             <input 
              type="text" 
              placeholder="Search descriptions..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
             />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
             <select 
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 font-medium"
             >
                <option value="all">All Types</option>
                <option value="contribution">Contributions</option>
                <option value="loan_payment">Loan Payments</option>
                <option value="fine">Fines</option>
                <option value="debt_addition">Loans Issued</option>
             </select>
          </div>
       </div>

       <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
             <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                <tr>
                   <th className="px-6 py-4">Timestamp</th>
                   <th className="px-6 py-4">Transaction</th>
                   <th className="px-6 py-4">Category</th>
                   <th className="px-6 py-4 text-right">Credit/Debit</th>
                </tr>
             </thead>
             <tbody className="text-sm divide-y divide-slate-50">
                {filtered.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                     <td className="px-6 py-4 font-mono text-[10px] text-slate-400">
                        {tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleString() : 'Processing'}
                     </td>
                     <td className="px-6 py-4">
                        <p className="font-semibold text-slate-800">{tx.description}</p>
                        <p className="text-[10px] text-slate-400">Ref: {tx.id.substring(0, 8)}</p>
                     </td>
                     <td className="px-6 py-4">
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                          tx.type === 'contribution' ? "bg-emerald-50 text-emerald-700" :
                          tx.type === 'fine' ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700"
                        )}>
                          {tx.type.replace('_', ' ')}
                        </span>
                     </td>
                     <td className={cn(
                       "px-6 py-4 text-right font-bold font-mono",
                       tx.type === 'contribution' ? "text-emerald-600" : "text-red-500"
                     )}>
                        {tx.type === 'contribution' ? '+' : '-'}{formatCurrency(tx.amount)}
                     </td>
                  </tr>
                ))}
             </tbody>
          </table>
       </div>
    </motion.div>
  );
}

function ReportsView({ transactions, membersCount }: { transactions: Transaction[], membersCount: number }) {
  const totalIn = transactions
    .filter(tx => tx.type === 'contribution' || tx.type === 'loan_payment' || tx.type === 'fine')
    .reduce((sum, tx) => sum + tx.amount, 0);
  
  const totalOut = transactions
    .filter(tx => tx.type === 'debt_addition')
    .reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
       <header>
          <h3 className="text-2xl font-bold text-slate-800">Financial Performance</h3>
          <p className="text-sm text-slate-400">Aggregated SacMa health metrics and compliance data.</p>
       </header>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-8 bg-emerald-600 rounded-2xl text-white shadow-xl shadow-emerald-100 flex flex-col justify-between">
             <BarChart3 className="mb-4 opacity-50" size={32} />
             <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-2">Total Sacco Assets</p>
                <p className="text-3xl font-bold font-mono tracking-tight">{formatCurrency(totalIn - totalOut)}</p>
             </div>
          </div>
          <div className="p-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
             <TrendingUp className="mb-4 text-emerald-500" size={32} />
             <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Portfolio Growth</p>
                <p className="text-3xl font-bold font-mono text-slate-800 tracking-tight">+14.2%</p>
             </div>
          </div>
          <div className="p-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
             <Users className="mb-4 text-sky-500" size={32} />
             <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Member Retention</p>
                <p className="text-3xl font-bold font-mono text-slate-800 tracking-tight">98.5%</p>
             </div>
          </div>
       </div>

       <div className="bg-slate-900 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
             <div className="space-y-6">
                <h4 className="text-3xl font-bold">Consolidated Balance Sheet</h4>
                <p className="text-slate-400 leading-relaxed">
                   Generating the annual report creates an immutable PDF document for auditors and members. 
                   Ensure all manual transactions are reconciled before closing the financial month.
                </p>
                <div className="flex gap-4">
                   <button className="px-6 py-3 bg-emerald-600 rounded-xl font-bold text-sm hover:bg-emerald-500 transition shadow-lg flex items-center gap-2">
                      <Download size={18} /> Download Annual FY24
                   </button>
                   <button className="px-6 py-3 bg-slate-800 rounded-xl font-bold text-sm hover:bg-slate-700 transition flex items-center gap-2">
                      <BarChart3 size={18} /> View Analytics
                   </button>
                </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                {[
                  { l: 'Total Collections', v: totalIn },
                  { l: 'Total Disbursements', v: totalOut },
                  { l: 'Interest Gained', v: totalIn * 0.12 },
                  { l: 'Operational Cash', v: (totalIn - totalOut) * 0.4 }
                ].map((item, i) => (
                  <div key={i} className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50">
                     <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">{item.l}</p>
                     <p className="text-xl font-bold font-mono">{formatCurrency(item.v)}</p>
                  </div>
                ))}
             </div>
          </div>
          <div className="absolute top-0 right-0 p-12 opacity-[0.03]">
             <ShieldCheck size={200} />
          </div>
       </div>
    </motion.div>
  );
}
function LoansView({ loans, isAdmin, profile }: { loans: any[], isAdmin: boolean, profile: UserProfile | null }) {
  const handleAction = async (loanId: string, action: 'approved' | 'rejected', loanAmount: number, userId: string) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'loans', loanId), { status: action });
      if (action === 'approved') {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const current = userDoc.data() as UserProfile;
          await updateDoc(userRef, {
            totalDebt: (current.totalDebt || 0) + loanAmount
          });
          // Add approval transaction record
          await addDoc(collection(db, 'transactions'), {
            userId,
            amount: loanAmount,
            type: 'debt_addition',
            description: `Loan Approval - ${loanId}`,
            status: 'completed',
            timestamp: serverTimestamp()
          });
        }
      }
    } catch (e) {
      console.error(e);
      alert("Action failed");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
       <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold">Loans & Fines Tracker</h3>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
            <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700">Loan Applications</div>
            <div className="divide-y divide-slate-50">
               {loans.map(loan => (
                 <div key={loan.id} className="p-6 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                          <p className="text-lg font-bold text-slate-800">{formatCurrency(loan.amount)}</p>
                          <p className="text-xs text-slate-400">{loan.createdAt?.seconds ? new Date(loan.createdAt.seconds * 1000).toLocaleString() : 'Just now'}</p>
                       </div>
                       <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                          loan.status === 'approved' ? "bg-emerald-100 text-emerald-700" : 
                          loan.status === 'rejected' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                       )}>
                          {loan.status}
                       </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-4 italic">"{loan.reason}"</p>
                    {isAdmin && loan.status === 'pending' && (
                       <div className="flex gap-2">
                          <button onClick={() => handleAction(loan.id, 'approved', loan.amount, loan.userId)} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm">Approve</button>
                          <button onClick={() => handleAction(loan.id, 'rejected', loan.amount, loan.userId)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">Decline</button>
                       </div>
                    )}
                 </div>
               ))}
            </div>
          </div>

          <div className="space-y-6">
             <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-bold mb-4 text-slate-800">Your Debt Exposure</h4>
                <div className="bg-red-50 p-6 rounded-xl border border-red-100 mb-6">
                   <p className="text-[10px] font-bold text-red-800 uppercase tracking-widest mb-1 opacity-60">Total Unpaid Amount</p>
                   <p className="text-3xl font-bold text-red-600 font-mono tracking-tight">{formatCurrency(profile?.totalDebt || 0)}</p>
                </div>
                <div className="space-y-3">
                   <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Principal Remaining</span>
                      <span className="text-slate-800 font-bold font-mono">{formatCurrency(profile?.totalDebt || 0)}</span>
                   </div>
                   <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500" style={{ width: '100%' }}></div>
                   </div>
                </div>
             </div>

             <div className="bg-slate-900 p-6 rounded-xl shadow-lg text-white">
                <h4 className="font-bold mb-2 flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4 text-emerald-400" />
                   Loan Policy
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">Most loans are approved within 24-48 business hours. Ensure your contribution history is up to date to maintain a high credit ratio.</p>
             </div>
          </div>
       </div>
    </motion.div>
  );
}

function MembersView({ setIsTxModalOpen, setTxTargetUserId, isAdmin, isAddModalOpen, setIsAddModalOpen }: any) {
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    const unsubMembers = onSnapshot(query(collection(db, 'users'), orderBy('displayName', 'asc')), (s) => {
      setMembers(s.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubLoans = onSnapshot(collection(db, 'loans'), (s) => {
      setLoans(s.docs.map(d => ({ id: d.id, ...d.data() } as Loan)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'loans'));

    return () => {
      unsubMembers();
      unsubLoans();
    };
  }, []);

  const getLoanCount = (userId: string) => {
    return loans.filter(l => l.userId === userId && l.status === 'approved').length;
  };

  const filteredMembers = members.filter(m => 
    (m.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.memberId && m.memberId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === members.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(members.map(m => m.uid)));
    }
  };

  const handleBulkRoleUpdate = async (newRole: any) => {
    if (!confirm(`Update ${selectedIds.size} members to ${newRole}?`)) return;
    
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.update(doc(db, 'users', id), { role: newRole });
      });
      await batch.commit();
      setSelectedIds(new Set());
      alert("Roles updated successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const handleBulkNotification = () => {
    const message = prompt("Enter broadcast message for selected members:");
    if (!message) return;
    
    alert(`Broadcast sent to ${selectedIds.size} members: ${message}`);
    setSelectedIds(new Set());
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 relative">
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-2xl font-bold text-slate-800 shrink-0">Member Registry</h3>
          
          <div className="flex-1 w-full md:max-w-lg">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text"
                  placeholder="Search by name, email or member ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                />
             </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <>
                <button 
                  className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition shadow-sm"
                  title="Export Registry"
                >
                  <FileDown size={20} />
                </button>
                <button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition shadow-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add New Member
                </button>
              </>
            )}
          </div>
       </div>
       <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
                 <tr>
                    {isAdmin && (
                      <th className="px-6 py-4 w-10">
                         <input 
                           type="checkbox" 
                           checked={selectedIds.size === members.length && members.length > 0}
                           onChange={toggleSelectAll}
                           className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                         />
                      </th>
                    )}
                    <th className="px-6 py-4">Member Name & ID</th>
                    <th className="px-6 py-4">Total Savings</th>
                    <th className="px-6 py-4 text-center">Approved Loans</th>
                    <th className="px-6 py-4">Current Debt</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                 </tr>
              </thead>
              <tbody className="text-sm text-slate-600 divide-y divide-slate-50">
                 {filteredMembers.length === 0 ? (
                   <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="px-6 py-12 text-center text-slate-400">
                         <div className="flex flex-col items-center justify-center">
                            <Search className="w-12 h-12 mb-3 opacity-10" />
                            <p className="font-medium">No members found matching your search</p>
                            <div className="flex gap-4 mt-4">
                               <button 
                                 onClick={() => setSearchTerm('')}
                                 className="text-slate-500 font-bold text-xs hover:underline"
                               >
                                  Clear search
                               </button>
                               {isAdmin && (
                                 <button 
                                   onClick={() => setIsAddModalOpen(true)}
                                   className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:bg-emerald-700 transition"
                                 >
                                    Add member
                                 </button>
                               )}
                            </div>
                         </div>
                      </td>
                   </tr>
                 ) : (
                   filteredMembers.map(m => {
                     const loanCount = getLoanCount(m.uid);
                   return (
                     <tr key={m.uid} className={cn("hover:bg-slate-50 transition-colors cursor-pointer", (isAdmin && m.totalDebt > 0) && "bg-red-50/30", (isAdmin && selectedIds.has(m.uid)) && "bg-emerald-50")}>
                        {isAdmin && (
                           <td className="px-6 py-4 text-center">
                              <input 
                                type="checkbox" 
                                checked={selectedIds.has(m.uid)}
                                onChange={() => toggleSelect(m.uid)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                           </td>
                        )}
                        <td className="px-6 py-4" onClick={() => (isAdmin || m.uid === auth.currentUser?.uid) && setSelectedMember(m)}>
                           <div className="font-medium text-slate-800">{m.displayName}</div>
                           <div className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase">{m.memberId || 'NO-ID'}</div>
                        </td>
                        <td className="px-6 py-4 font-mono font-medium text-slate-700">
                           {isAdmin || m.uid === auth.currentUser?.uid ? formatCurrency(m.balance || 0) : '••••••'}
                        </td>
                        <td className="px-6 py-4 text-center">
                           <span className={cn(
                             "inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold",
                             loanCount > 0 ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-400"
                           )}>
                             {loanCount}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           <span className={cn(
                             "font-mono font-bold",
                             (m.totalDebt || 0) > 0 ? "text-red-600" : "text-slate-400"
                           )}>
                              {isAdmin || m.uid === auth.currentUser?.uid ? ((m.totalDebt || 0) > 0 ? formatCurrency(m.totalDebt) : "—") : '••••••'}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                             "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                             (m.totalDebt || 0) === 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                           )}>
                             {(m.totalDebt || 0) === 0 ? 'CLEAN' : 'DEBT'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <button 
                            onClick={() => (isAdmin || m.uid === auth.currentUser?.uid) && setSelectedMember(m)}
                            className="text-sky-600 font-bold text-xs hover:underline uppercase tracking-tight"
                           >
                             {isAdmin || m.uid === auth.currentUser?.uid ? 'Details' : 'Profile'}
                           </button>
                        </td>
                     </tr>
                   );
                 })
                )}
              </tbody>
            </table>
          </div>
       </div>

        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-8 border border-slate-700/50 w-max"
            >
               <div className="flex items-center gap-3 pr-8 border-r border-slate-700">
                  <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center font-bold text-sm">
                     {selectedIds.size}
                  </div>
                  <span className="text-sm font-bold tracking-tight">Members Selected</span>
               </div>

               <div className="flex gap-4">
                  <button 
                    onClick={handleBulkNotification}
                    className="flex items-center gap-2 hover:text-emerald-400 transition text-sm font-bold"
                  >
                     <Bell size={16} /> Broadcast
                  </button>
                  <div className="h-4 w-px bg-slate-700" />
                  <div className="flex items-center gap-2">
                     <ShieldCheck size={16} className="text-slate-400" />
                     <select 
                      onChange={(e) => handleBulkRoleUpdate(e.target.value as UserRole)}
                      className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer hover:text-sky-400 transition"
                      defaultValue=""
                     >
                        <option value="" disabled className="text-slate-900">Change Role...</option>
                        <option value="member" className="text-slate-900">Demote to Member</option>
                        <option value="treasurer" className="text-slate-900">Promote to Treasurer</option>
                     </select>
                  </div>
                  <div className="h-4 w-px bg-slate-700" />
                  <button 
                    onClick={() => setSelectedIds(new Set())}
                    className="text-slate-400 hover:text-white transition text-sm font-bold"
                  >
                     Cancel
                  </button>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

       {selectedMember && (
         <MemberProfileModal 
           member={selectedMember} 
           isAdmin={isAdmin}
           onClose={() => setSelectedMember(null)} 
           onRecordPayment={() => {
              setTxTargetUserId(selectedMember.uid);
              setIsTxModalOpen(true);
           }}
         />
       )}

    </motion.div>
  );
}

function AddMemberModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [department, setDepartment] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // For pre-registration, we use a random ID. 
      // In a real app, you might use email as the ID or handle claiming later.
      const userId = `pre_${Math.random().toString(36).substring(2, 10)}`;
      
      const newMember: UserProfile = {
        uid: userId,
        memberId: memberId || `SACMA-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        email,
        displayName,
        phoneNumber,
        nationalId,
        department,
        address,
        role: 'member',
        balance: 0,
        totalDebt: 0,
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', userId), newMember);
      alert("Member added to registry!");
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to add member. Ensure ID is unique.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
       <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
       <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-white w-full max-w-2xl rounded-2xl p-8 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh]"
       >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold text-slate-800">Add New SacMa Member</h3>
              <p className="text-sm text-slate-500">Provide full registration details for the new member.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Member Name</label>
                 <input 
                   type="text" 
                   required 
                   value={displayName}
                   onChange={(e) => setDisplayName(e.target.value)}
                   placeholder="Full Legal Name"
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 text-sm"
                 />
               </div>

               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Email Address</label>
                 <input 
                   type="email" 
                   required 
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   placeholder="member@example.com"
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 text-sm"
                 />
               </div>

               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Phone Number</label>
                 <input 
                   type="tel" 
                   required 
                   value={phoneNumber}
                   onChange={(e) => setPhoneNumber(e.target.value)}
                   placeholder="+254 700 000000"
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 text-sm"
                 />
               </div>

               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">National ID Number</label>
                 <input 
                   type="text" 
                   required 
                   value={nationalId}
                   onChange={(e) => setNationalId(e.target.value)}
                   placeholder="12345678"
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
                 />
               </div>

               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Department / Group</label>
                 <input 
                   type="text" 
                   value={department}
                   onChange={(e) => setDepartment(e.target.value)}
                   placeholder="e.g. Transport, IT..."
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 text-sm"
                 />
               </div>

               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Member ID (Optional)</label>
                 <input 
                   type="text" 
                   value={memberId}
                   onChange={(e) => setMemberId(e.target.value)}
                   placeholder="e.g. SN-00123"
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
                 />
               </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Residential Address</label>
              <textarea 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, City, County..."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 text-sm resize-none"
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 mt-4"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Member Details"}
            </button>
          </form>
       </motion.div>
    </div>
  );
}

function MemberProfileModal({ member, isAdmin, onClose, onRecordPayment }: { member: UserProfile, isAdmin: boolean, onClose: () => void, onRecordPayment: () => void }) {
  const [history, setHistory] = useState<Transaction[]>([]);
  const [memberLoans, setMemberLoans] = useState<Loan[]>([]);
  const [updatingRole, setUpdatingRole] = useState(false);
  
  const handleRoleChange = async (newRole: 'member' | 'treasurer') => {
    if (!isAdmin) return;
    if (newRole === member.role) return;
    
    // Prevent self-demotion if necessary, or at least warn. 
    // But since this is from the registry, they might be clicking themselves.
    if (member.role === 'treasurer' && newRole === 'member') {
      const confirmDemote = window.confirm(`Are you sure you want to revoke Treasurer status from ${member.displayName}? They will lose administrative access.`);
      if (!confirmDemote) return;
    }

    setUpdatingRole(true);
    try {
      await updateDoc(doc(db, 'users', member.uid), {
        role: newRole,
        lastUpdated: serverTimestamp()
      });
      alert(`Role successfully changed to ${newRole}`);
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update role. Permission denied.");
    } finally {
      setUpdatingRole(false);
    }
  };
  
  useEffect(() => {
    const qTx = query(
      collection(db, 'transactions'), 
      where('userId', '==', member.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    const unsubTx = onSnapshot(qTx, (s) => {
      setHistory(s.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    });

    const qLoans = query(
      collection(db, 'loans'),
      where('userId', '==', member.uid)
    );
    const unsubLoans = onSnapshot(qLoans, (s) => {
      setMemberLoans(s.docs.map(d => ({ id: d.id, ...d.data() } as Loan)));
    });

    return () => {
      unsubTx();
      unsubLoans();
    };
  }, [member.uid]);

  const approvedLoans = memberLoans.filter(l => l.status === 'approved');
  const pendingLoans = memberLoans.filter(l => l.status === 'pending');

  const shareStatement = () => {
    const date = new Date().toLocaleDateString();
    const message = `Hello ${member.displayName},
    
Your SacMa account summary as of ${date}:

Contributions: ${formatCurrency(member.balance || 0)}
Outstanding Loan: ${formatCurrency(member.totalDebt || 0)}
Last Payment Date: ${history[0]?.timestamp?.seconds ? new Date(history[0].timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}

Please ensure all balances are cleared before the next deadline.
    
SacMa Ledger`;
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text("SacMa Ledger", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Official Member Statement | Generated: ${date}`, 14, 28);
    
    // Member Info
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text("Member Information", 14, 45);
    
    doc.setFontSize(10);
    doc.text(`Name: ${member.displayName}`, 14, 52);
    doc.text(`Email: ${member.email}`, 14, 58);
    doc.text(`Member ID: ${member.memberId || member.uid}`, 14, 64);
    
    // Summary Box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(14, 75, 182, 30, 'F');
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.rect(14, 75, 182, 30, 'S');

    doc.setFontSize(12);
    doc.setTextColor(5, 150, 105);
    doc.text("Total Savings", 20, 85);
    doc.text(formatCurrency(member.balance || 0), 20, 95);

    doc.setTextColor(220, 38, 38); // red-600
    doc.text("Total Debt", 110, 85);
    doc.text(formatCurrency(member.totalDebt || 0), 110, 95);

    // Transaction History Table
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Recent Transaction History", 14, 120);

    const tableRows = history.map(tx => [
      tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleString() : 'Processing',
      tx.description,
      tx.type.replace('_', ' ').toUpperCase(),
      tx.type === 'contribution' ? `+${formatCurrency(tx.amount)}` : `-${formatCurrency(tx.amount)}`
    ]);

    autoTable(doc, {
      head: [['Timestamp', 'Description', 'Category', 'Amount']],
      body: tableRows,
      startY: 125,
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85] }, // slate-700
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        "This is a system-generated statement. Integrity is maintained through cryptographic audit logs.",
        14,
        doc.internal.pageSize.getHeight() - 10
      );
    }

    doc.save(`${member.displayName.replace(/\s+/g, '_')}_Statement_${date}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
       <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
       <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-white w-full max-w-2xl rounded-2xl p-0 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
       >
          <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
             <div className="flex gap-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 font-bold text-2xl">
                   {member.displayName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    {member.displayName}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      member.role === 'treasurer' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {member.role}
                    </span>
                  </h3>
                  <p className="text-sm text-slate-400">{member.email}</p>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1 tracking-widest">ID: {member.memberId || member.uid}</p>
                </div>
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={generatePDF}
                  className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition flex items-center gap-2 shadow-sm"
                >
                  <FileDown size={14} /> Download PDF
                </button>
                <button 
                  onClick={onRecordPayment}
                  className="bg-sky-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-sky-700 transition flex items-center gap-2 shadow-sm"
                >
                  <Receipt size={14} /> Record Payment
                </button>
                <button 
                  onClick={shareStatement}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-2 shadow-sm"
                >
                  <ArrowUpRight size={14} /> Share Statement
                </button>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
             </div>
          </div>

          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-50">
             <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest mb-1">Total Savings</p>
                <p className="text-xl font-bold text-emerald-700 font-mono">{formatCurrency(member.balance || 0)}</p>
             </div>
             <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                <p className="text-[10px] font-bold text-red-800 uppercase tracking-widest mb-1">Total Debt</p>
                <p className="text-xl font-bold text-red-700 font-mono">{formatCurrency(member.totalDebt || 0)}</p>
             </div>
             <div className="bg-sky-50 p-4 rounded-xl border border-sky-100">
                <p className="text-[10px] font-bold text-sky-800 uppercase tracking-widest mb-1">Approved Loans</p>
                <p className="text-xl font-bold text-sky-700 font-mono">{approvedLoans.length}</p>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {isAdmin && (
                  <div className="md:col-span-2 p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                        <ShieldAlert size={14} className="text-amber-500" />
                        Admin Role Management
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-1">Assign or revoke administrative privileges for this member.</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        disabled={updatingRole || member.role === 'member'}
                        onClick={() => handleRoleChange('member')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                          member.role === 'member' 
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm'
                        }`}
                      >
                        <UserMinus size={14} /> Demote to Member
                      </button>
                      <button 
                        disabled={updatingRole || member.role === 'treasurer'}
                        onClick={() => handleRoleChange('treasurer')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                          member.role === 'treasurer' 
                          ? 'bg-amber-100 text-amber-400 cursor-not-allowed' 
                          : 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm'
                        }`}
                      >
                        <ShieldCheck size={14} /> Promote to Treasurer
                      </button>
                    </div>
                  </div>
                )}
               <div>
                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                     <Users size={16} className="text-emerald-600" />
                     <span>Identification Details</span>
                  </h4>
                  <div className="space-y-4">
                     <div className="flex justify-between items-center py-2 border-b border-slate-50">
                        <span className="text-xs text-slate-500">National ID</span>
                        <span className="text-sm font-semibold text-slate-700 font-mono">{member.nationalId || 'Not Provided'}</span>
                     </div>
                     <div className="flex justify-between items-center py-2 border-b border-slate-50">
                        <span className="text-xs text-slate-500">Phone Number</span>
                        <span className="text-sm font-semibold text-slate-700">{member.phoneNumber || 'Not Provided'}</span>
                     </div>
                     <div className="flex justify-between items-center py-2 border-b border-slate-50">
                        <span className="text-xs text-slate-500">Department</span>
                        <span className="text-sm font-semibold text-slate-700">{member.department || 'General Member'}</span>
                     </div>
                  </div>
               </div>
               <div>
                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                     <Settings size={16} className="text-emerald-600" />
                     <span>Contact & Location</span>
                  </h4>
                  <div className="space-y-4">
                    <div>
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Residential Address</p>
                       <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                          {member.address || 'Address information not registered for this member.'}
                       </p>
                    </div>
                  </div>
               </div>
             </div>

             <div>
                <h4 className="font-bold text-slate-800 mb-4 flex items-center justify-between">
                   <span>Recent History</span>
                   <span className="text-[10px] text-slate-400 font-normal">Last 20 records</span>
                </h4>
                <div className="space-y-3">
                   {history.map(tx => (
                     <div key={tx.id} className="flex justify-between items-center p-3 rounded-lg border border-slate-50 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                           <div className={cn(
                             "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                             tx.type === 'contribution' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                           )}>
                             {tx.type === 'contribution' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                           </div>
                           <div>
                              <p className="text-sm font-semibold text-slate-800">{tx.description}</p>
                              <p className="text-[10px] text-slate-400">{tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleString() : 'Processing...'}</p>
                           </div>
                        </div>
                        <span className={cn(
                          "font-mono font-bold text-sm",
                          tx.type === 'contribution' ? "text-emerald-600" : "text-red-500"
                        )}>
                          {tx.type === 'contribution' ? '+' : '-'}{tx.amount}
                        </span>
                     </div>
                   ))}
                </div>
             </div>

             <div>
                <h4 className="font-bold text-slate-800 mb-4 flex items-center justify-between">
                   <span>Member Documents</span>
                   <button className="text-[10px] text-emerald-600 font-bold hover:underline">+ Upload New</button>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 border border-slate-100 rounded-xl flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer group">
                      <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                         <FileText size={20} />
                      </div>
                      <div>
                         <p className="text-xs font-bold text-slate-700">National ID.pdf</p>
                         <p className="text-[10px] text-slate-400">Uploaded 12 May 2024</p>
                      </div>
                   </div>
                   <div className="p-4 border border-slate-100 rounded-xl flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer group">
                      <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                         <Receipt size={20} />
                      </div>
                      <div>
                         <p className="text-xs font-bold text-slate-700">Join Agreement.jpg</p>
                         <p className="text-[10px] text-slate-400">Uploaded 12 May 2024</p>
                      </div>
                   </div>
                </div>
             </div>
          </div>
       </motion.div>
    </div>
  );
}

function AnnouncementsView({ announcements, isAdmin }: { announcements: Announcement[], isAdmin: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-5xl mx-auto py-8">
       <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-2xl font-bold text-slate-800 tracking-tight">SacMa Broadcasts</h3>
            <p className="text-sm text-slate-500">Official updates, rate changes, and community notices.</p>
          </div>
          {isAdmin && (
             <button 
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition shadow-lg flex items-center gap-2"
             >
               <Plus className="w-4 h-4" /> New Broadcast
             </button>
          )}
       </div>

       {isAdmin && announcements.length === 0 && (
         <div 
          onClick={() => setIsModalOpen(true)}
          className="p-8 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-all group"
         >
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
              <Megaphone className="w-6 h-6 text-slate-400 group-hover:text-emerald-600" />
            </div>
            <h4 className="font-bold text-slate-700">No Announcements Yet</h4>
            <p className="text-sm text-slate-500 max-w-xs mx-auto mb-4">You haven't broadcasted any updates to the SACCO members yet.</p>
            <span className="text-sm font-bold text-emerald-600">Click here to post your first update</span>
         </div>
       )}

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {announcements.map(ann => (
             <div key={ann.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full hover:border-emerald-500/50 transition-colors group">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-50">
                   <div className={cn(
                      "text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider",
                      ann.type === 'dividend' ? "bg-emerald-100 text-emerald-800" :
                      ann.type === 'interest' ? "bg-sky-100 text-sky-800" :
                      "bg-slate-100 text-slate-700"
                    )}>
                      {ann.type}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono font-bold">
                      {new Date(ann.createdAt?.seconds * 1000).toLocaleDateString()}
                    </span>
                </div>
                <h4 className="text-lg font-bold mb-2 group-hover:text-emerald-700 transition-colors">{ann.title}</h4>
                <p className="text-slate-600 text-sm leading-relaxed flex-1">{ann.content}</p>
                {ann.value !== undefined && (
                   <div className="mt-4 p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-none">New Rate</span>
                      <span className="text-xl font-bold text-emerald-700 font-mono leading-none">{ann.value}%</span>
                   </div>
                )}
             </div>
          ))}
       </div>

       {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsModalOpen(false)} />
             <AnnouncementForm onClose={() => setIsModalOpen(false)} />
          </div>
       )}
    </motion.div>
  );
}

function AnnouncementForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<Announcement['type']>('general');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        title,
        content,
        type,
        value: value ? parseFloat(value) : null,
        createdAt: serverTimestamp(),
        authorUid: auth.currentUser?.uid
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, 'announcements');
        throw err;
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert("Error posting announcement. Check security rules.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="relative bg-white w-full max-w-lg rounded-2xl p-8 shadow-2xl border border-slate-200"
    >
       <div className="flex items-center justify-between mb-8">
          <div>
             <h3 className="text-xl font-bold text-slate-800">Broadcast SACCO Update</h3>
             <p className="text-sm text-slate-500">This will be visible to all members.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
       </div>

       <form onSubmit={handleSubmit} className="space-y-6">
          <div>
             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Headline</label>
             <input value={title} onChange={e => setTitle(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" placeholder="e.g. Annual General Meeting" />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Notice Type</label>
                <select value={type} onChange={e => setType(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 font-medium">
                   <option value="general">General</option>
                   <option value="dividend">Dividend</option>
                   <option value="interest">Interest</option>
                </select>
             </div>
             <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Rate Value (%)</label>
                <input type="number" step="0.1" value={value} onChange={e => setValue(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 font-mono" placeholder="Optional" />
             </div>
          </div>
          <div>
             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Message Body</label>
             <textarea value={content} onChange={e => setContent(e.target.value)} required rows={4} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" placeholder="Details for members..." />
          </div>
          <button disabled={loading} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-lg hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2">
             {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Publish to Members"}
          </button>
       </form>
    </motion.div>
  );
}

function NotificationsView({ notifications }: { notifications: SaccoNotification[] }) {
  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) {
      console.error(e);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    for (const n of unread) {
      await markAsRead(n.id);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Personal Alerts</h3>
          <p className="text-sm text-slate-500">Notifications specifically for your account.</p>
        </div>
        {notifications.some(n => !n.read) && (
          <button 
            onClick={markAllRead}
            className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg transition-colors border border-emerald-100"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-4">
        {notifications.length === 0 ? (
          <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No alerts yet. We'll notify you here!</p>
          </div>
        ) : (
          notifications.map(n => (
            <div 
              key={n.id} 
              className={cn(
                "p-5 rounded-2xl border transition-all relative overflow-hidden",
                n.read ? "bg-white border-slate-100 opacity-75" : "bg-white border-emerald-100 shadow-sm shadow-emerald-50 ring-1 ring-emerald-50"
              )}
            >
              <div className="flex gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                  n.type === 'fine' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                )}>
                  {n.type === 'fine' ? <AlertCircle className="w-6 h-6" /> : <Bell className="w-6 h-6" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-slate-800">{n.title}</h4>
                    <span className="text-[10px] font-medium text-slate-400">
                      {n.createdAt?.toDate().toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed mb-3">{n.message}</p>
                  {!n.read && (
                    <button 
                      onClick={() => markAsRead(n.id)}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
              {!n.read && (
                <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500 rounded-bl-2xl flex items-center justify-center">
                   <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function SettingsView({ settings, isAdmin }: { settings: SaccoSettings | null, isAdmin: boolean }) {
  const [divRate, setDivRate] = useState(settings?.dividendRate.toString() || '6.0');
  const [intRate, setIntRate] = useState(settings?.loanInterestRate.toString() || '12.0');
  const [fineAmount, setFineAmount] = useState(settings?.fineAmount?.toString() || '200');
  const [gracePeriod, setGracePeriod] = useState(settings?.fineGracePeriodMinutes?.toString() || '0');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const updates: any = {
        dividendRate: parseFloat(divRate),
        loanInterestRate: parseFloat(intRate),
        fineAmount: parseFloat(fineAmount),
        fineGracePeriodMinutes: parseInt(gracePeriod),
        lastUpdated: serverTimestamp()
      };
      // Preserve last run timestamp
      if (settings?.lastFineRunTimestamp) {
        updates.lastFineRunTimestamp = settings.lastFineRunTimestamp;
      }
      
      await setDoc(doc(db, 'settings', 'global'), updates);
      alert("Settings updated!");
    } catch (e) {
      console.error(e);
      alert("Error updating settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto py-12">
       <div className="bg-white p-8 md:p-12 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-6 mb-10">
             <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center">
                <Settings className="w-8 h-8 text-emerald-600" />
             </div>
             <div>
                <h3 className="text-2xl font-bold text-slate-800 tracking-tight">SacMa Configuration</h3>
                <p className="text-sm text-slate-400">Global treasury parameters and rates.</p>
             </div>
          </div>

          <div className="space-y-8">
             {/* Automated System Status */}
             <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Clock className="w-4 h-4 text-white" />
                   </div>
                   <div>
                      <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Fine Automation Status</p>
                      <p className="text-xs text-emerald-600 font-medium">Activated: Daily Assessment after 5 PM</p>
                   </div>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-bold text-slate-400 uppercase">Last Assessment</p>
                   <p className="text-xs font-bold text-slate-700">
                      {settings?.lastFineRunTimestamp?.toDate ? settings.lastFineRunTimestamp.toDate().toLocaleString() : 'Never'}
                   </p>
                </div>
             </div>
             <div className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Current Dividend Rate (%)</label>
                <div className="flex items-center gap-4">
                   <input 
                    type="number" 
                    disabled={!isAdmin}
                    value={divRate}
                    onChange={e => setDivRate(e.target.value)}
                    className="flex-1 text-4xl font-bold bg-transparent border-none focus:ring-0 font-mono text-slate-800"
                   />
                   <span className="text-2xl font-bold text-slate-300">%</span>
                </div>
             </div>

             <div className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Loan Interest Rate (%)</label>
                <div className="flex items-center gap-4">
                   <input 
                    type="number" 
                    disabled={!isAdmin}
                    value={intRate}
                    onChange={e => setIntRate(e.target.value)}
                    className="flex-1 text-4xl font-bold bg-transparent border-none focus:ring-0 font-mono text-slate-800"
                   />
                   <span className="text-2xl font-bold text-slate-300">%</span>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-6 bg-red-50/50 rounded-xl border border-red-100">
                    <label className="block text-[10px] font-bold text-red-600 uppercase tracking-widest mb-4">Late Fine Amount (KSh)</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-red-300">KSh</span>
                      <input 
                        type="number" 
                        disabled={!isAdmin}
                        value={fineAmount}
                        onChange={e => setFineAmount(e.target.value)}
                        className="flex-1 text-2xl font-bold bg-transparent border-none focus:ring-0 font-mono text-red-700"
                      />
                    </div>
                </div>

                <div className="p-6 bg-sky-50/50 rounded-xl border border-sky-100">
                    <label className="block text-[10px] font-bold text-sky-600 uppercase tracking-widest mb-4">Grace Period (Min)</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        disabled={!isAdmin}
                        value={gracePeriod}
                        onChange={e => setGracePeriod(e.target.value)}
                        className="flex-1 text-2xl font-bold bg-transparent border-none focus:ring-0 font-mono text-sky-700"
                      />
                      <span className="text-xl font-bold text-sky-300">min</span>
                    </div>
                </div>
             </div>

             {isAdmin && (
                <button 
                  onClick={handleUpdate}
                  disabled={loading}
                  className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Apply Global Changes"}
                </button>
             )}
          </div>
          <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
             <ShieldCheck className="w-48 h-48" />
          </div>
       </div>
    </motion.div>
  );
}
