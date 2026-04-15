import { useState, useMemo, useRef, useEffect, type ReactNode, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  TrendingUp, Users, DollarSign, PieChart, Settings2, ArrowRight,
  Target, Zap, ShieldAlert, Trash2, LayoutDashboard, Table as TableIcon,
  Activity, HelpCircle, LogIn, LogOut, Cloud, RefreshCw
} from 'lucide-react';
import { 
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, 
  LineChart, Line
} from 'recharts';

import { ScenarioInputs, CostParameter, PayrollItem } from './types';
import { calculateFinancials, generateSensitivityData } from './lib/finance';
import { cn, formatCurrency, formatPercent, parseCurrency, formatCurrencyInput } from './lib/utils';

// Firebase
import { auth, db } from './firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { initializeApp, deleteApp } from 'firebase/app';
import { 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged, 
  signOut,
  getAuth,
  User
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  serverTimestamp,
  getDoc,
  deleteDoc,
  collection
} from 'firebase/firestore';

const DEFAULT_INPUTS: ScenarioInputs = {
  name: 'Cenário Base', students: 60, numberOfClasses: 2, monthlyTicket: 1000,
  discountPercent: 15, taxPercent: 12, taxOnGross: true,
  teacherCLT: { type: 'fixed', value: 120 },
  teacherPJ: { type: 'fixed', value: 150 },
  payrollItems: [
    { id: '1', category: 'administrativa', role: 'Coordenador', salary: 5000, quantity: 1 },
    { id: '2', category: 'apoio', role: 'Secretaria', salary: 2500, quantity: 1 },
  ],
  thirdPartyServices: { type: 'percent', value: 5 },
  rentOccupation: { type: 'fixed', value: 3000 },
  maintenance: { type: 'fixed', value: 1000 },
  travel: { type: 'fixed', value: 1500 },
  otherOperational: { type: 'percent', value: 3 },
  teacherHoursPerMonth: 40, initialInvestment: 150000, projectionMonths: 18,
};

const SCENARIOS_CONFIG = [
  { id: 'conservative', name: 'Conservador', color: '#ef4444', icon: ShieldAlert },
  { id: 'base', name: 'Base', color: '#3b82f6', icon: Target },
  { id: 'aggressive', name: 'Agressivo', color: '#10b981', icon: Zap },
];

const TooltipInfo = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-1 align-middle">
    <HelpCircle className="w-3.5 h-3.5 text-slate-300 hover:text-blue-500 cursor-help transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl leading-tight">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800" />
    </div>
  </div>
);

const StatCard = ({ title, value, subValue, icon: Icon, color, delay = 0, tooltip }: { title: string; value: string | number; subValue?: string; icon: any; color: string; delay?: number; tooltip?: string }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-1">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center"><span className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</span>{tooltip && <TooltipInfo text={tooltip} />}</div>
      <div className={cn("p-2 rounded-lg", color)}><Icon className="w-5 h-5 text-white" /></div>
    </div>
    <div className="text-2xl font-bold text-slate-900">{value}</div>
    {subValue && <div className="text-sm text-slate-400">{subValue}</div>}
  </motion.div>
);

const InputGroup = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="space-y-4 mb-8">
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">{title}</h3>
    <div className="space-y-3">{children}</div>
  </div>
);

const FormattedInput = ({ value, onChange, className, prefix, suffix }: { value: number; onChange: (v: number) => void; className?: string; prefix?: string; suffix?: string }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState(formatCurrencyInput(value));
  useEffect(() => { if (document.activeElement !== inputRef.current) setDisplayValue(formatCurrencyInput(value)); }, [value]);
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value; setDisplayValue(rawValue);
    onChange(parseCurrency(rawValue));
  };
  const handleBlur = () => setDisplayValue(formatCurrencyInput(value));
  return (
    <div className="relative w-full">
      {prefix && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">{prefix}</div>}
      <input ref={inputRef} type="text" value={displayValue} onChange={handleChange} onBlur={handleBlur} className={cn(className, prefix && "pl-10", suffix && "pr-10")} />
      {suffix && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">{suffix}</div>}
    </div>
  );
};

const InputField = ({ label, value, onChange, type = "number", prefix, suffix, step = 1, tooltip }: { label: string; value: any; onChange: (v: any) => void; type?: string; prefix?: string; suffix?: string; step?: number; tooltip?: string }) => (
  <div className="space-y-1.5">
    <div className="flex items-center"><label className="text-sm font-medium text-slate-600 ml-1">{label}</label>{tooltip && <TooltipInfo text={tooltip} />}</div>
    {prefix === 'R$' ? (
      <FormattedInput value={value} onChange={onChange} prefix={prefix} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
    ) : (
      <div className="relative">
        {prefix && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">{prefix}</div>}
        <input type={type} step={step} value={value} onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)} className={cn("w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all", prefix && "pl-10", suffix && "pr-10")} />
        {suffix && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">{suffix}</div>}
      </div>
    )}
  </div>
);

const CostInputField = ({ label, param, onChange, isTeacher, tooltip }: { label: string; param: CostParameter; onChange: (v: CostParameter) => void; isTeacher?: boolean; tooltip?: string }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between ml-1">
      <div className="flex items-center"><label className="text-sm font-medium text-slate-600">{label} {isTeacher && param.type === 'fixed' ? '(Valor Hora)' : ''}</label>{tooltip && <TooltipInfo text={tooltip} />}</div>
      <div className="flex bg-slate-100 p-0.5 rounded-md">
        <button onClick={() => onChange({ ...param, type: 'fixed' })} className={cn("px-1.5 py-0.5 text-[10px] font-bold rounded", param.type === 'fixed' ? "bg-white shadow-xs text-blue-600" : "text-slate-400")}>FIXO</button>
        <button onClick={() => onChange({ ...param, type: 'percent' })} className={cn("px-1.5 py-0.5 text-[10px] font-bold rounded", param.type === 'percent' ? "bg-white shadow-xs text-blue-600" : "text-slate-400")}>% RL</button>
      </div>
    </div>
    {param.type === 'fixed' ? (
      <FormattedInput value={param.value} onChange={(v: number) => onChange({ ...param, value: v })} prefix="R$" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
    ) : (
      <div className="relative">
        <input type="number" value={param.value} onChange={(e) => onChange({ ...param, value: parseFloat(e.target.value) || 0 })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all pr-10" />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">%</div>
      </div>
    )}
  </div>
);

const TabButton = ({ id, label, icon: Icon, active, onClick }: { id: any; label: string; icon: any; active: boolean; onClick: (id: any) => void }) => (
  <button onClick={() => onClick(id)} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap", active ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700")}>
    <Icon className="w-4 h-4" />{label}
  </button>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [view, setView] = useState<'dashboard' | 'comparison' | 'admin'>('dashboard');
  const [activeTab, setActiveTab] = useState<'summary' | 'dre' | 'drivers' | 'cashflow' | 'sensitivity' | 'costs' | 'levers' | 'payroll'>('summary');
  const [presentationMode, setPresentationMode] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState('base');
  const dashboardRef = useRef<HTMLDivElement>(null);

  const [invites, setInvites] = useState<string[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInvitePassword, setNewInvitePassword] = useState('');
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [scenarios, setScenarios] = useState<Record<string, ScenarioInputs>>(() => {
    const savedV4 = localStorage.getItem('fincalc_scenarios_v4');
    if (savedV4) try { return JSON.parse(savedV4); } catch (e) { console.error(e); }
    
    const savedV3 = localStorage.getItem('fincalc_scenarios_v3');
    if (savedV3) try { return JSON.parse(savedV3); } catch (e) { console.error(e); }

    return {
      conservative: { ...DEFAULT_INPUTS, name: 'Conservador', students: 40, numberOfClasses: 2, discountPercent: 25 },
      base: { ...DEFAULT_INPUTS },
      aggressive: { ...DEFAULT_INPUTS, name: 'Agressivo', students: 100, numberOfClasses: 4, discountPercent: 5 },
    };
  });

  const [customScenarioIds, setCustomScenarioIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('fincalc_custom_ids_v4');
    return saved ? JSON.parse(saved) : [];
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync Listener
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, 'shared', 'main'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.scenarios) {
          setScenarios(data.scenarios);
          // Extrair IDs customizados (aqueles que não são base, conservative, aggressive)
          const ids = Object.keys(data.scenarios).filter(id => !['base', 'conservative', 'aggressive'].includes(id));
          setCustomScenarioIds(ids);
          setLastSynced(data.updatedAt?.toDate() || new Date());
        }
      }
    }, (error) => {
      console.error('Erro ao ler dados compartilhados:', error);
      if (error.message.includes('insufficient permissions')) {
        setAuthError('Sua conta não tem permissão para acessar os dados. Verifique se seu e-mail foi autorizado.');
        signOut(auth);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Admin Invites Listener
  useEffect(() => {
    if (!user || user.email !== 'elaine.benfica@gmail.com') return;

    const unsubscribe = onSnapshot(collection(db, 'invites'), (snapshot) => {
      const emails = snapshot.docs.map(doc => doc.id);
      setInvites(emails);
    }, (error) => {
      console.error('Erro ao ler convites:', error);
    });

    return () => unsubscribe();
  }, [user]);

  const saveToCloud = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      await setDoc(doc(db, 'shared', 'main'), {
        scenarios,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email
      });
      setLastSynced(new Date());
    } catch (error) {
      console.error('Erro ao salvar na nuvem:', error);
      alert('Erro ao salvar dados. Verifique sua conexão ou permissões.');
    } finally {
      setIsSyncing(false);
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const cleanEmail = email.toLowerCase().trim();
    
    try {
      // 1. Tentar fazer login primeiro para ter as permissões necessárias para ler o convite
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      
      // 2. Verificar se o email está na lista de convidados (whitelist)
      // A Elaine sempre tem acesso
      if (cleanEmail !== 'elaine.benfica@gmail.com') {
        const inviteDoc = await getDoc(doc(db, 'invites', cleanEmail));
        if (!inviteDoc.exists()) {
          await signOut(auth);
          setAuthError('Este e-mail não possui convite para acessar o sistema.');
        }
      }
    } catch (error: any) {
      console.error('Erro de login:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setAuthError('E-mail ou senha incorretos.');
      } else if (error.code === 'permission-denied') {
        // Se o login funcionou mas o getDoc falhou por permissão, provavelmente não está convidado
        await signOut(auth);
        setAuthError('Acesso negado. Verifique se seu e-mail foi autorizado.');
      } else {
        setAuthError('Ocorreu um erro ao tentar acessar. Tente novamente.');
      }
    }
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Apenas a Elaine pode entrar via Google se não tiver senha ainda
      if (result.user.email !== 'elaine.benfica@gmail.com') {
        await signOut(auth);
        setAuthError('Acesso via Google permitido apenas para o administrador.');
      }
    } catch (error: any) {
      console.error('Erro Google Login:', error);
      setAuthError('Erro ao acessar com Google.');
    }
  };

  const addInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInviteEmail || !newInvitePassword) return;
    if (newInvitePassword.length < 6) {
      setAdminMessage({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    setIsAdminLoading(true);
    setAdminMessage(null);
    
    let secondaryApp;
    try {
      // Usar um nome único para a instância secundária para evitar conflitos de rede/estado
      const appName = `AuthWorker_${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);
      
      try {
        await createUserWithEmailAndPassword(secondaryAuth, newInviteEmail.toLowerCase().trim(), newInvitePassword);
        await signOut(secondaryAuth);
      } catch (authError: any) {
        // Se o e-mail já estiver em uso, apenas seguimos para garantir que esteja no Firestore
        if (authError.code !== 'auth/email-already-in-use') {
          throw authError;
        }
      }

      // 2. Adicionar à lista de convidados (Whitelist) no Firestore
      await setDoc(doc(db, 'invites', newInviteEmail.toLowerCase().trim()), {
        invitedAt: serverTimestamp(),
        invitedBy: user?.email
      });

      setAdminMessage({ type: 'success', text: `Usuário ${newInviteEmail} autorizado com sucesso!` });
      setNewInviteEmail('');
      setNewInvitePassword('');
    } catch (error: any) {
      console.error('Erro ao adicionar convite:', error);
      let msg = 'Erro ao criar usuário: ' + (error.message || 'Erro desconhecido');
      
      if (error.code === 'auth/network-request-failed') {
        msg = 'Erro de rede: Verifique se você tem algum Ad-Blocker (bloqueador de anúncios) ativado. Eles costumam bloquear o serviço de criação de usuários do Firebase. Tente desativá-lo para esta página.';
      }
      
      setAdminMessage({ type: 'error', text: msg });
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (e) {
          console.error('Erro ao limpar app secundário:', e);
        }
      }
      setIsAdminLoading(false);
    }
  };

  const removeInvite = async (emailToRemove: string) => {
    if (!window.confirm(`Remover acesso de ${emailToRemove}?`)) return;
    setIsAdminLoading(true);
    try {
      await deleteDoc(doc(db, 'invites', emailToRemove));
    } catch (error) {
      console.error('Erro ao remover convite:', error);
    } finally {
      setIsAdminLoading(false);
    }
  };

  const logout = () => signOut(auth);

  const activeInputs = scenarios[activeScenarioId] || scenarios['base'];
  const results = useMemo(() => calculateFinancials(activeInputs), [activeInputs]);
  
  const allScenarioConfigs = useMemo(() => [
    ...SCENARIOS_CONFIG,
    ...customScenarioIds.map(id => ({ id, name: scenarios[id]?.name || 'Estudo', color: 'bg-slate-500', icon: Activity }))
  ], [customScenarioIds, scenarios]);

  const allResults = useMemo(() => allScenarioConfigs.reduce((acc, config) => { 
    acc[config.id] = calculateFinancials(scenarios[config.id] || scenarios['base']); 
    return acc; 
  }, {} as Record<string, any>), [scenarios, allScenarioConfigs]);

  useEffect(() => { 
    localStorage.setItem('fincalc_scenarios_v4', JSON.stringify(scenarios));
    localStorage.setItem('fincalc_custom_ids_v4', JSON.stringify(customScenarioIds));
  }, [scenarios, customScenarioIds]);

  const handleInputChange = (field: keyof ScenarioInputs, value: any) => {
    setScenarios(prev => ({ ...prev, [activeScenarioId]: { ...prev[activeScenarioId], [field]: value < 0 ? 0 : value } }));
  };

  const saveStudy = () => {
    const id = 'study_' + Math.random().toString(36).substr(2, 9);
    const newName = `${activeInputs.name} (Cópia)`;
    setScenarios(prev => ({ ...prev, [id]: { ...activeInputs, name: newName } }));
    setCustomScenarioIds(prev => [...prev, id]);
    setActiveScenarioId(id);
  };

  const deleteScenario = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === activeScenarioId) setActiveScenarioId('base');
    setCustomScenarioIds(prev => prev.filter(i => i !== id));
    setScenarios(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const addPayrollItem = () => {
    const newItem: PayrollItem = { id: Math.random().toString(36).substr(2, 9), category: 'apoio', role: '', salary: 0, quantity: 1 };
    handleInputChange('payrollItems', [...(activeInputs.payrollItems || []), newItem]);
  };

  const removePayrollItem = (id: string) => {
    handleInputChange('payrollItems', (activeInputs.payrollItems || []).filter(item => item.id !== id));
  };

  const updatePayrollItem = (id: string, field: keyof PayrollItem, value: any) => {
    handleInputChange('payrollItems', (activeInputs.payrollItems || []).map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();
    
    // 1. DRE DETALHADA
    const dreRows: any[][] = [
      ['RELATÓRIO FINANCEIRO EXECUTIVO'],
      ['Estudo:', activeInputs.name],
      ['Data de Exportação:', new Date().toLocaleDateString('pt-BR')],
      [''],
      ['ESTRUTURA DA DRE', 'VALOR (R$)', '% SOBRE RL'],
    ];

    results.dreLines.forEach(line => {
      dreRows.push([
        line.label,
        line.value,
        line.percentOfNetRevenue ? (line.percentOfNetRevenue / 100) : 0
      ]);
    });

    dreRows.push(['']);
    dreRows.push(['INDICADORES DE VIABILIDADE', 'VALOR', 'STATUS']);
    dreRows.push(['TIR (Taxa Interna de Retorno)', (results.irr || 0) / 100, results.classification.status]);
    dreRows.push(['Payback Estimado (Meses)', results.payback || 0, '']);
    dreRows.push(['Margem Operacional Final', results.operatingMargin / 100, '']);

    const dreSheet = XLSX.utils.aoa_to_sheet(dreRows);

    // Aplicando formatos numéricos (Moeda e Porcentagem)
    const range = XLSX.utils.decode_range(dreSheet['!ref'] || 'A1:C50');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      // Coluna B (Valores)
      const cellB = dreSheet[XLSX.utils.encode_cell({ r: R, c: 1 })];
      if (cellB && typeof cellB.v === 'number' && R > 3) {
        cellB.z = '"R$ "#,##0.00';
      }
      // Coluna C (Percentuais)
      const cellC = dreSheet[XLSX.utils.encode_cell({ r: R, c: 2 })];
      if (cellC && typeof cellC.v === 'number' && R > 3) {
        cellC.z = '0.0%';
      }
    }

    dreSheet['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, dreSheet, "DRE Detalhada");

    // 2. COMPARATIVO DE CENÁRIOS
    const compRows: any[][] = [
      ['COMPARATIVO DE CENÁRIOS E ESTUDOS'],
      [''],
      ['Cenário', 'Alunos', 'Mensalidade', 'Rec. Líquida', 'Res. Operacional', 'TIR (%)', 'Payback']
    ];

    allScenarioConfigs.forEach(config => {
      const res = allResults[config.id];
      const inputs = scenarios[config.id];
      compRows.push([
        inputs.name,
        inputs.students,
        inputs.monthlyTicket,
        res.netRevenue,
        res.operatingResult,
        (res.irr || 0) / 100,
        res.payback || 0
      ]);
    });

    const compSheet = XLSX.utils.aoa_to_sheet(compRows);
    
    // Formatos no Comparativo
    const compRange = XLSX.utils.decode_range(compSheet['!ref'] || 'A1:G20');
    for (let R = 2; R <= compRange.e.r; ++R) {
      [3, 4].forEach(C => {
        const cell = compSheet[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell) cell.z = '"R$ "#,##0.00';
      });
      const cellTIR = compSheet[XLSX.utils.encode_cell({ r: R, c: 5 })];
      if (cellTIR) cellTIR.z = '0.0%';
    }

    compSheet['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, compSheet, "Comparativo");

    XLSX.writeFile(workbook, `FinCalc_Relatorio_${activeInputs.name}.xlsx`);
  };

  const exportToPDF = () => {
    window.print();
  };

  const sensitivityTicket = useMemo(() => generateSensitivityData(activeInputs, 'monthlyTicket', [500, 750, 1000, 1250, 1500]), [activeInputs]);
  const sensitivityStudents = useMemo(() => generateSensitivityData(activeInputs, 'students', [20, 40, 60, 80, 100]), [activeInputs]);

  if (!isAuthReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 mx-auto mb-6">
              <TrendingUp className="text-white w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Acesso Restrito</h1>
            <p className="text-slate-500">Entre com seu e-mail e senha de convidado.</p>
          </div>
          
          <form onSubmit={login} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-600 ml-1">E-mail</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                placeholder="seu@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-600 ml-1">Senha</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>

            {authError && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 bg-red-50 text-red-600 text-xs font-medium rounded-lg border border-red-100"
              >
                {authError}
              </motion.div>
            )}

            <button 
              type="submit"
              className="w-full flex items-center justify-center gap-3 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg mt-2"
            >
              <LogIn className="w-5 h-5" />
              Acessar Sistema
            </button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold tracking-widest">Área do Administrador</span></div>
            </div>

            <button 
              type="button"
              onClick={loginWithGoogle}
              className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-blue-100 text-blue-600 rounded-2xl font-bold hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="" />
              Entrar com Google (Admin)
            </button>
          </form>
          
          <p className="mt-8 text-[10px] text-slate-400 uppercase tracking-widest font-bold text-center">
            Sistema de Gestão Estratégica
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <AnimatePresence>
        {!presentationMode && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 320, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-10 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200"><TrendingUp className="text-white w-6 h-6" /></div>
                <div><h1 className="font-bold text-slate-900 leading-tight">FinCalc Pós</h1><p className="text-[10px] text-blue-600 font-bold">Versão 4.1 - Estável</p></div>
              </div>
              <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
                <button onClick={() => setView('dashboard')} className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all text-xs font-bold", view === 'dashboard' ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}><LayoutDashboard className="w-3.5 h-3.5" />DASHBOARD</button>
                <button onClick={() => setView('comparison')} className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all text-xs font-bold", view === 'comparison' ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}><TableIcon className="w-3.5 h-3.5" />COMPARAÇÃO</button>
              </div>

              {user?.email === 'elaine.benfica@gmail.com' && (
                <button 
                  onClick={() => setView('admin')} 
                  className={cn("w-full flex items-center justify-center gap-2 py-3 rounded-xl mb-4 transition-all text-xs font-bold border-2", 
                    view === 'admin' ? "bg-slate-900 border-slate-900 text-white shadow-lg" : "bg-white border-slate-100 text-slate-600 hover:border-slate-200")
                  }
                >
                  <Users className="w-4 h-4" />
                  GERENCIAR ACESSOS
                </button>
              )}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl mb-4">
                {SCENARIOS_CONFIG.map((config) => (
                  <button key={config.id} onClick={() => setActiveScenarioId(config.id)} className={cn("flex flex-col items-center py-2 rounded-lg transition-all", activeScenarioId === config.id ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}>
                    <config.icon className="w-4 h-4 mb-1" /><span className="text-[10px] font-bold uppercase tracking-tighter">{config.name}</span>
                  </button>
                ))}
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estudos Salvos</h3>
                  <div className="flex gap-2">
                    <button onClick={saveToCloud} disabled={isSyncing} className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                      {isSyncing ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Cloud className="w-2 h-2" />}
                      SALVAR NUVEM
                    </button>
                    <button onClick={saveStudy} className="text-[10px] font-bold text-blue-600 hover:text-blue-700">+ NOVO</button>
                  </div>
                </div>
                {lastSynced && (
                  <p className="text-[9px] text-slate-400 px-1 mb-2 italic">
                    Sincronizado em: {lastSynced.toLocaleTimeString()}
                  </p>
                )}
                <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-none">
                  {customScenarioIds.length === 0 && <p className="text-[10px] text-slate-400 italic px-1">Nenhum estudo salvo.</p>}
                  {customScenarioIds.map(id => (
                    <div key={id} onClick={() => setActiveScenarioId(id)} className={cn("group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all", activeScenarioId === id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-600")}>
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Activity className="w-3 h-3 flex-shrink-0" />
                        <span className="text-xs font-medium truncate">{scenarios[id]?.name}</span>
                      </div>
                      <button onClick={(e) => deleteScenario(id, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              <InputGroup title="Identificação">
                <InputField label="Nome do Estudo" type="text" value={activeInputs.name} onChange={(v) => handleInputChange('name', v)} />
              </InputGroup>
              
              <InputGroup title="Receita">
                <InputField label="Alunos" value={activeInputs.students} onChange={(v) => handleInputChange('students', v)} />
                <InputField label="Turmas" value={activeInputs.numberOfClasses} onChange={(v) => handleInputChange('numberOfClasses', v)} />
                <InputField label="Mensalidade" prefix="R$" value={activeInputs.monthlyTicket} onChange={(v) => handleInputChange('monthlyTicket', v)} />
                <InputField label="Descontos" suffix="%" value={activeInputs.discountPercent} onChange={(v) => handleInputChange('discountPercent', v)} />
                <InputField label="Impostos" suffix="%" value={activeInputs.taxPercent} onChange={(v) => handleInputChange('taxPercent', v)} />
              </InputGroup>

              <InputGroup title="Custos Diretos">
                <CostInputField label="Docente CLT" param={activeInputs.teacherCLT} onChange={(v) => handleInputChange('teacherCLT', v)} isTeacher />
                <CostInputField label="Docente PJ" param={activeInputs.teacherPJ} onChange={(v) => handleInputChange('teacherPJ', v)} isTeacher />
                <InputField label="Horas/Mês" value={activeInputs.teacherHoursPerMonth} onChange={(v) => handleInputChange('teacherHoursPerMonth', v)} />
              </InputGroup>

              <InputGroup title="Demais Despesas">
                <CostInputField label="Serv. Terceiros" param={activeInputs.thirdPartyServices} onChange={(v) => handleInputChange('thirdPartyServices', v)} />
                <CostInputField label="Aluguel/Ocupação" param={activeInputs.rentOccupation} onChange={(v) => handleInputChange('rentOccupation', v)} />
                <CostInputField label="Manutenção" param={activeInputs.maintenance} onChange={(v) => handleInputChange('maintenance', v)} />
                <CostInputField label="Viagens/Hosped." param={activeInputs.travel} onChange={(v) => handleInputChange('travel', v)} />
                <CostInputField label="Outros Operac." param={activeInputs.otherOperational} onChange={(v) => handleInputChange('otherOperational', v)} />
              </InputGroup>

              <InputGroup title="Viabilidade">
                <InputField label="Investimento" prefix="R$" value={activeInputs.initialInvestment} onChange={(v) => handleInputChange('initialInvestment', v)} />
                <InputField label="Horizonte" suffix="meses" value={activeInputs.projectionMonths} onChange={(v) => handleInputChange('projectionMonths', v)} />
              </InputGroup>
            </div>
            <div className="mt-auto pt-6 border-t border-slate-100 p-6">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-3 overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-white shadow-sm" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
                      {user.displayName?.charAt(0) || user.email?.charAt(0)}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">{user.displayName || 'Usuário'}</p>
                    <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
                <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-y-auto p-8 scrollbar-thin" ref={dashboardRef}>
        <header className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              {view === 'dashboard' ? 'Dashboard Executivo' : view === 'comparison' ? 'Comparativo' : 'Gerenciamento de Acessos'}
            </h2>
            <p className="text-slate-500 font-medium">{view === 'admin' ? 'Controle de convites e permissões' : activeInputs.name}</p>
          </div>
          {view !== 'admin' && (
            <div className="flex gap-3">
              <button onClick={() => setPresentationMode(!presentationMode)} className="px-4 py-2 bg-white border rounded-xl text-sm font-semibold">{presentationMode ? 'Sair' : 'Apresentação'}</button>
              <button onClick={exportToExcel} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold">Excel</button>
              <button 
                onClick={exportToPDF} 
                className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-sm font-semibold transition-all"
              >
                PDF
              </button>
            </div>
          )}
        </header>

        {view === 'admin' ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl space-y-8">
            <div className="bg-white p-8 rounded-3xl border shadow-sm">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Users className="text-blue-600" />
                Convidar e Criar Usuário
              </h3>
              <form onSubmit={addInvite} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">E-mail do Convidado</label>
                    <input 
                      type="email" 
                      placeholder="exemplo@email.com" 
                      value={newInviteEmail}
                      onChange={(e) => setNewInviteEmail(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Senha de Acesso</label>
                    <input 
                      type="password" 
                      placeholder="Mínimo 6 caracteres" 
                      value={newInvitePassword}
                      onChange={(e) => setNewInvitePassword(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
                
                {adminMessage && (
                  <div className={cn("p-3 rounded-lg text-xs font-medium border", 
                    adminMessage.type === 'success' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100")
                  }>
                    {adminMessage.text}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isAdminLoading}
                  className="w-full md:w-auto px-10 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAdminLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                  {isAdminLoading ? 'Processando...' : 'Autorizar e Criar Acesso'}
                </button>
              </form>
              <p className="mt-6 p-4 bg-blue-50 rounded-2xl text-[11px] text-blue-700 leading-relaxed">
                <strong>💡 Como funciona:</strong> Ao clicar no botão, o sistema cria a conta de acesso e autoriza o e-mail simultaneamente. 
                O convidado poderá logar imediatamente usando o e-mail e a senha que você definiu acima.
              </p>
            </div>

            <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
              <div className="p-8 border-b">
                <h3 className="text-xl font-bold">E-mails Autorizados</h3>
              </div>
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-8 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">E-mail</th>
                    <th className="px-8 py-4 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invites.map(email => (
                    <tr key={email} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4 text-sm font-medium text-slate-700">{email}</td>
                      <td className="px-8 py-4 text-center">
                        {email !== 'elaine.benfica@gmail.com' ? (
                          <button 
                            onClick={() => removeInvite(email)}
                            className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                            title="Remover Acesso"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">ADMIN</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {invites.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-8 py-12 text-center text-slate-400 italic text-sm">
                        Nenhum convidado cadastrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : view === 'dashboard' ? (
          <div id="dashboard-content" className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard title="Result. Operacional" value={formatCurrency(results.operatingResult)} subValue={`Margem: ${formatPercent(results.operatingMargin)}`} icon={TrendingUp} color="bg-emerald-500" tooltip="Lucro líquido da operação antes de impostos financeiros e investimentos." />
              <StatCard title="TIR (IRR)" value={results.irr ? `${results.irr.toFixed(2)}%` : 'N/A'} subValue="Rentabilidade" icon={PieChart} color="bg-blue-500" tooltip="Taxa Interna de Retorno: a rentabilidade anualizada do projeto." />
              <StatCard title="Payback" value={results.payback ? `${results.payback.toFixed(1)} meses` : 'N/A'} subValue="Retorno" icon={ArrowRight} color="bg-amber-500" tooltip="Tempo necessário para recuperar o investimento inicial." />
              <StatCard title="Receita Líquida" value={formatCurrency(results.netRevenue)} subValue="Total" icon={DollarSign} color="bg-indigo-500" tooltip="Faturamento total após descontos e impostos sobre vendas." />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              <TabButton id="summary" label="Resumo" icon={Activity} active={activeTab === 'summary'} onClick={setActiveTab} />
              <TabButton id="dre" label="DRE" icon={TableIcon} active={activeTab === 'dre'} onClick={setActiveTab} />
              <TabButton id="drivers" label="Indicadores" icon={Target} active={activeTab === 'drivers'} onClick={setActiveTab} />
              <TabButton id="payroll" label="Folha" icon={Users} active={activeTab === 'payroll'} onClick={setActiveTab} />
              <TabButton id="cashflow" label="Fluxo de Caixa" icon={TrendingUp} active={activeTab === 'cashflow'} onClick={setActiveTab} />
              <TabButton id="sensitivity" label="Sensibilidade" icon={Settings2} active={activeTab === 'sensitivity'} onClick={setActiveTab} />
              <TabButton id="levers" label="Alavancas" icon={Zap} active={activeTab === 'levers'} onClick={setActiveTab} />
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'summary' && (
                <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-8 rounded-3xl border shadow-sm">
                  <h3 className="text-lg font-bold mb-4">Parecer de Viabilidade</h3>
                  <div className="p-6 bg-slate-50 rounded-2xl border flex gap-6 items-center">
                    <div className={cn("text-xl font-bold", results.classification.color)}>{results.classification.status}</div>
                    <p className="text-slate-600">{results.summary}</p>
                  </div>
                </motion.div>
              )}
              {activeTab === 'dre' && (
                <motion.div key="dre" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50"><tr><th className="px-8 py-4">Item</th><th className="px-8 py-4 text-right">Valor</th><th className="px-8 py-4 text-right">% RL</th></tr></thead>
                    <tbody>
                      {results.dreLines.map((line, i) => (
                        <tr key={i} className={cn("border-b", line.isTotal && "bg-blue-50/30")}>
                          <td className={cn("px-8 py-4", line.isBold && "font-bold")}>{line.label}</td>
                          <td className="px-8 py-4 text-right font-mono">{line.label.includes('Mg.') ? formatPercent(line.value) : formatCurrency(line.value)}</td>
                          <td className="px-8 py-4 text-right text-slate-400 text-xs">{line.percentOfNetRevenue ? `${line.percentOfNetRevenue.toFixed(1)}%` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}
              {activeTab === 'drivers' && (
                <motion.div key="drivers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-3xl border shadow-sm">
                    <h3 className="font-bold mb-4">Eficiência por Aluno</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between"><span>Receita Líquida / Aluno</span><span className="font-bold">{formatCurrency(results.drivers.revenuePerStudent)}</span></div>
                      <div className="flex justify-between"><span>Custo Total / Aluno</span><span className="font-bold text-red-500">{formatCurrency(results.drivers.costPerStudent)}</span></div>
                      <div className="flex justify-between border-t pt-2"><span>Margem / Aluno</span><span className="font-bold text-emerald-600">{formatCurrency(results.drivers.marginPerStudent)}</span></div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border shadow-sm">
                    <h3 className="font-bold mb-4">Ponto de Equilíbrio</h3>
                    <div className="flex flex-col items-center justify-center h-full py-4">
                      <div className="text-4xl font-black text-blue-600">{Math.ceil(results.drivers.breakEvenStudents)}</div>
                      <div className="text-sm text-slate-400 font-medium uppercase tracking-widest">Alunos para Break-even</div>
                    </div>
                  </div>
                </motion.div>
              )}
              {activeTab === 'payroll' && (
                <motion.div key="payroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                  <div className="p-8 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold">Folha de Apoio e Administrativa</h3>
                    <button onClick={addPayrollItem} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">+ Cargo</button>
                  </div>
                  <table className="w-full">
                    <thead className="bg-slate-50"><tr><th className="px-8 py-4">Cargo</th><th className="px-8 py-4 text-center">Qtd</th><th className="px-8 py-4 text-right">Salário</th><th className="px-8 py-4 text-center">Ações</th></tr></thead>
                    <tbody>
                      {activeInputs.payrollItems.map(item => (
                        <tr key={item.id} className="border-b">
                          <td className="px-8 py-4"><input value={item.role} onChange={e => updatePayrollItem(item.id, 'role', e.target.value)} className="w-full bg-slate-50 p-2 rounded" /></td>
                          <td className="px-8 py-4 text-center"><input type="number" value={item.quantity} onChange={e => updatePayrollItem(item.id, 'quantity', Number(e.target.value))} className="w-16 text-center bg-slate-50 p-2 rounded" /></td>
                          <td className="px-8 py-4 text-right"><FormattedInput value={item.salary} onChange={v => updatePayrollItem(item.id, 'salary', v)} className="w-32 text-right bg-slate-50 p-2 rounded" /></td>
                          <td className="px-8 py-4 text-center"><button onClick={() => removePayrollItem(item.id)} className="text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}
              {activeTab === 'cashflow' && (
                <motion.div key="cashflow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-8 rounded-3xl border shadow-sm">
                  <h3 className="font-bold mb-6">Fluxo de Caixa Acumulado</h3>
                  <div className="h-[350px]">
                    <ResponsiveContainer>
                      <LineChart data={results.cumulativeCashFlow.map((val, i) => ({ month: i, value: val }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" label={{ value: 'Meses', position: 'insideBottom', offset: -5 }} />
                        <YAxis tickFormatter={v => formatCurrency(v).replace('R$', '').trim()} />
                        <Tooltip formatter={(v: any) => formatCurrency(v)} />
                        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              )}
              {activeTab === 'sensitivity' && (
                <motion.div key="sensitivity" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-3xl border shadow-sm">
                    <h3 className="font-bold mb-6">TIR vs Mensalidade</h3>
                    <div className="h-[300px]"><ResponsiveContainer><LineChart data={sensitivityTicket}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="value" tickFormatter={v => formatCurrency(v).replace(',00', '')} /><YAxis /><Tooltip /><Line type="monotone" dataKey="irr" stroke="#3b82f6" strokeWidth={3} /></LineChart></ResponsiveContainer></div>
                  </div>
                  <div className="bg-white p-8 rounded-3xl border shadow-sm">
                    <h3 className="font-bold mb-6">Resultado vs Alunos</h3>
                    <div className="h-[300px]"><ResponsiveContainer><LineChart data={sensitivityStudents}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="value" /><YAxis tickFormatter={v => formatCurrency(v).replace('R$', '').trim()} /><Tooltip /><Line type="monotone" dataKey="operatingResult" stroke="#10b981" strokeWidth={3} /></LineChart></ResponsiveContainer></div>
                  </div>
                </motion.div>
              )}
              {activeTab === 'levers' && (
                <motion.div key="levers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  {results.levers.map((lever, i) => (
                    <div key={i} className="bg-white p-6 rounded-2xl border shadow-sm flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-slate-900">{lever.label}</h4>
                        <p className="text-sm text-slate-500">{lever.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-emerald-600">+{formatCurrency(lever.impact)}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Impacto no Resultado</div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {allScenarioConfigs.map(config => (
              <div key={config.id} className={cn("bg-white p-8 rounded-3xl border-2 transition-all", activeScenarioId === config.id ? "border-blue-500 shadow-lg shadow-blue-100" : "border-slate-100 hover:border-slate-200")}>
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-xl font-bold">{scenarios[config.id]?.name}</h3>
                  {customScenarioIds.includes(config.id) && (
                    <button onClick={(e) => deleteScenario(config.id, e)} className="text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-4 mb-8">
                  <div className="flex justify-between text-sm text-slate-500"><span>Receita Líquida</span><span className="font-bold text-slate-900">{formatCurrency(allResults[config.id].netRevenue)}</span></div>
                  <div className="flex justify-between text-sm text-slate-500"><span>Result. Operacional</span><span className="font-bold text-slate-900">{formatCurrency(allResults[config.id].operatingResult)}</span></div>
                  <div className="flex justify-between text-sm text-slate-500"><span>TIR</span><span className="font-bold text-blue-600">{allResults[config.id].irr?.toFixed(1)}%</span></div>
                  <div className="flex justify-between text-sm text-slate-500"><span>Payback</span><span className="font-bold text-amber-600">{allResults[config.id].payback?.toFixed(1)}m</span></div>
                </div>
                <button onClick={() => { setActiveScenarioId(config.id); setView('dashboard'); }} className="w-full py-3 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-xl font-bold transition-colors">DETALHES</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
