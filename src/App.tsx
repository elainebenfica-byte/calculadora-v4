import { useState, useMemo, useRef, useEffect, type ReactNode, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  TrendingUp, Users, DollarSign, PieChart, Settings2, ArrowRight,
  Target, Zap, ShieldAlert, Trash2, LayoutDashboard, Table as TableIcon,
  Activity, HelpCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, 
  LineChart, Line
} from 'recharts';

import { ScenarioInputs, CostParameter, PayrollItem } from './types';
import { calculateFinancials, generateSensitivityData } from './lib/finance';
import { cn, formatCurrency, formatPercent, parseCurrency, formatCurrencyInput } from './lib/utils';

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
  const [view, setView] = useState<'dashboard' | 'comparison'>('dashboard');
  const [activeTab, setActiveTab] = useState<'summary' | 'dre' | 'drivers' | 'cashflow' | 'sensitivity' | 'costs' | 'levers' | 'payroll'>('summary');
  const [presentationMode, setPresentationMode] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState('base');
  const dashboardRef = useRef<HTMLDivElement>(null);

  const [scenarios, setScenarios] = useState<Record<string, ScenarioInputs>>(() => {
    const saved = localStorage.getItem('fincalc_scenarios_v3');
    if (saved) try { return JSON.parse(saved); } catch (e) { console.error(e); }
    return {
      conservative: { ...DEFAULT_INPUTS, name: 'Conservador', students: 40, numberOfClasses: 2, discountPercent: 25 },
      base: { ...DEFAULT_INPUTS },
      aggressive: { ...DEFAULT_INPUTS, name: 'Agressivo', students: 100, numberOfClasses: 4, discountPercent: 5 },
    };
  });

  const activeInputs = scenarios[activeScenarioId];
  const results = useMemo(() => calculateFinancials(activeInputs), [activeInputs]);
  const allResults = useMemo(() => SCENARIOS_CONFIG.reduce((acc, config) => { acc[config.id] = calculateFinancials(scenarios[config.id]); return acc; }, {} as Record<string, any>), [scenarios]);

  useEffect(() => { localStorage.setItem('fincalc_scenarios_v3', JSON.stringify(scenarios)); }, [scenarios]);

  const handleInputChange = (field: keyof ScenarioInputs, value: any) => {
    setScenarios(prev => ({ ...prev, [activeScenarioId]: { ...prev[activeScenarioId], [field]: value < 0 ? 0 : value } }));
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
    const comparisonData = SCENARIOS_CONFIG.map(config => {
      const res = calculateFinancials(scenarios[config.id]);
      const inputs = scenarios[config.id];
      return { 'Cenário': config.name, 'Alunos': inputs.students, 'Mensalidade': inputs.monthlyTicket, 'Receita Líquida': res.netRevenue, 'Result. Operacional': res.operatingResult, 'TIR (%)': res.irr || 0, 'Payback (meses)': res.payback || 0 };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(comparisonData), "Comparativo");
    XLSX.writeFile(workbook, `Simulacao_Financeira_${activeInputs.name}.xlsx`);
  };

  const exportToPDF = async () => {
    if (!dashboardRef.current) return;
    const canvas = await html2canvas(dashboardRef.current, { scale: 2, useCORS: true, backgroundColor: '#f8fafc' });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfWidth, (canvas.height * pdfWidth) / canvas.width);
    pdf.save(`Relatorio_Executivo_${activeInputs.name}.pdf`);
  };

  const sensitivityTicket = useMemo(() => generateSensitivityData(activeInputs, 'monthlyTicket', [500, 750, 1000, 1250, 1500]), [activeInputs]);
  const sensitivityStudents = useMemo(() => generateSensitivityData(activeInputs, 'students', [20, 40, 60, 80, 100]), [activeInputs]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <AnimatePresence>
        {!presentationMode && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 320, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-10 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200"><TrendingUp className="text-white w-6 h-6" /></div>
                <div><h1 className="font-bold text-slate-900 leading-tight">FinCalc Pós</h1><p className="text-xs text-slate-400 font-medium">Executive Suite v2.0</p></div>
              </div>
              <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
                <button onClick={() => setView('dashboard')} className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all text-xs font-bold", view === 'dashboard' ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}><LayoutDashboard className="w-3.5 h-3.5" />DASHBOARD</button>
                <button onClick={() => setView('comparison')} className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all text-xs font-bold", view === 'comparison' ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}><TableIcon className="w-3.5 h-3.5" />COMPARAÇÃO</button>
              </div>
              <div className="flex p-1 bg-slate-100 rounded-xl">
                {SCENARIOS_CONFIG.map((config) => (
                  <button key={config.id} onClick={() => setActiveScenarioId(config.id)} className={cn("flex-1 flex flex-col items-center py-2 rounded-lg transition-all", activeScenarioId === config.id ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}>
                    <config.icon className="w-4 h-4 mb-1" /><span className="text-[10px] font-bold uppercase tracking-tighter">{config.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
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
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-y-auto p-8 scrollbar-thin" ref={dashboardRef}>
        <header className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{view === 'dashboard' ? 'Dashboard Executivo' : 'Comparativo'}</h2>
            <p className="text-slate-500 font-medium">{activeInputs.name}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setPresentationMode(!presentationMode)} className="px-4 py-2 bg-white border rounded-xl text-sm font-semibold">{presentationMode ? 'Sair' : 'Apresentação'}</button>
            <button onClick={exportToExcel} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold">Excel</button>
            <button onClick={exportToPDF} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold">PDF</button>
          </div>
        </header>

        {view === 'dashboard' ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard title="Result. Operacional" value={formatCurrency(results.operatingResult)} subValue={`Margem: ${formatPercent(results.operatingMargin)}`} icon={TrendingUp} color="bg-emerald-500" />
              <StatCard title="TIR (IRR)" value={results.irr ? `${results.irr.toFixed(2)}%` : 'N/A'} subValue="Rentabilidade" icon={PieChart} color="bg-blue-500" />
              <StatCard title="Payback" value={results.payback ? `${results.payback.toFixed(1)} meses` : 'N/A'} subValue="Retorno" icon={ArrowRight} color="bg-amber-500" />
              <StatCard title="Receita Líquida" value={formatCurrency(results.netRevenue)} subValue="Total" icon={DollarSign} color="bg-indigo-500" />
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
            {SCENARIOS_CONFIG.map(config => (
              <div key={config.id} className={cn("bg-white p-8 rounded-3xl border-2", activeScenarioId === config.id ? "border-blue-500" : "border-slate-100")}>
                <h3 className="text-xl font-bold mb-6">{config.name}</h3>
                <div className="space-y-4 mb-8">
                  <div className="flex justify-between"><span>Receita</span><span className="font-bold">{formatCurrency(allResults[config.id].netRevenue)}</span></div>
                  <div className="flex justify-between"><span>TIR</span><span className="font-bold text-blue-600">{allResults[config.id].irr?.toFixed(1)}%</span></div>
                </div>
                <button onClick={() => { setActiveScenarioId(config.id); setView('dashboard'); }} className="w-full py-3 bg-slate-50 rounded-xl font-bold">DETALHES</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
