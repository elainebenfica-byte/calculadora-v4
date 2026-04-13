import { FinancialResult, ScenarioInputs, CostParameter, ValueLever } from '../types';

export function calculateIRR(cashFlow: number[], guess: number = 0.1): number | null {
  const maxIterations = 1000;
  const precision = 1e-7;
  let irr = guess;
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dNpv = 0;
    for (let t = 0; t < cashFlow.length; t++) {
      const factor = Math.pow(1 + irr, t);
      npv += cashFlow[t] / factor;
      const denominator = factor * (1 + irr);
      if (Math.abs(denominator) > 1e-10) {
        dNpv -= (t * cashFlow[t]) / denominator;
      }
    }
    if (Math.abs(npv) < precision) return irr * 100;
    const nextIrr = irr - npv / dNpv;
    if (Math.abs(nextIrr - irr) < precision) return nextIrr * 100;
    irr = nextIrr;
  }
  return null;
}

export function calculatePayback(cashFlow: number[]): number | null {
  let cumulativeCashFlow = 0;
  for (let t = 0; t < cashFlow.length; t++) {
    cumulativeCashFlow += cashFlow[t];
    if (cumulativeCashFlow >= 0) {
      if (t === 0) return 0;
      const prevCumulative = cumulativeCashFlow - cashFlow[t];
      if (Math.abs(cashFlow[t]) < 1e-10) return t;
      const fraction = Math.abs(prevCumulative) / cashFlow[t];
      return t - 1 + fraction;
    }
  }
  return null;
}

function calculateCostValue(param: CostParameter, netRevenue: number, months: number): number {
  if (param.type === 'fixed') return param.value * months;
  return netRevenue * (param.value / 100);
}

export function calculateFinancials(inputs: ScenarioInputs, skipLevers: boolean = false): FinancialResult {
  const {
    students, numberOfClasses, monthlyTicket, discountPercent,
    taxPercent, taxOnGross, teacherHoursPerMonth, initialInvestment, projectionMonths,
  } = inputs;

  const grossRevenue = students * monthlyTicket * projectionMonths;
  const discounts = grossRevenue * (discountPercent / 100);
  const taxBase = taxOnGross ? grossRevenue : (grossRevenue - discounts);
  const taxes = taxBase * (taxPercent / 100);
  const netRevenue = grossRevenue - discounts - taxes;

  let teacherCLT = inputs.teacherCLT.type === 'fixed' 
    ? (inputs.teacherCLT.value * 1.75) * teacherHoursPerMonth * numberOfClasses * projectionMonths
    : netRevenue * (inputs.teacherCLT.value / 100);

  let teacherPJ = inputs.teacherPJ.type === 'fixed'
    ? inputs.teacherPJ.value * teacherHoursPerMonth * numberOfClasses * projectionMonths
    : netRevenue * (inputs.teacherPJ.value / 100);

  const totalMonthlyPayroll = (inputs.payrollItems || []).reduce((acc, item) => acc + (item.salary * (item.quantity || 1)), 0);
  const supportAdminPayroll = totalMonthlyPayroll * 1.75 * projectionMonths;

  const thirdPartyServices = calculateCostValue(inputs.thirdPartyServices, netRevenue, projectionMonths);
  const rentOccupation = calculateCostValue(inputs.rentOccupation, netRevenue, projectionMonths);
  const maintenance = calculateCostValue(inputs.maintenance, netRevenue, projectionMonths);
  const travel = calculateCostValue(inputs.travel, netRevenue, projectionMonths);
  const otherOperational = calculateCostValue(inputs.otherOperational, netRevenue, projectionMonths);

  const totalCosts = teacherCLT + teacherPJ + supportAdminPayroll + thirdPartyServices + rentOccupation + maintenance + travel + otherOperational;
  const operatingResult = netRevenue - totalCosts;
  const operatingMargin = netRevenue > 0 ? (operatingResult / netRevenue) * 100 : 0;

  const monthlyOperatingResult = operatingResult / projectionMonths;
  const cashFlow = [-initialInvestment, ...Array(projectionMonths).fill(monthlyOperatingResult)];
  
  const cumulativeCashFlow: number[] = [];
  let currentSum = 0;
  cashFlow.forEach(val => {
    currentSum += val;
    cumulativeCashFlow.push(currentSum);
  });

  const payback = calculatePayback(cashFlow);
  const irr = calculateIRR(cashFlow);

  const revenuePerStudent = students > 0 ? netRevenue / students : 0;
  const revenuePerClass = numberOfClasses > 0 ? netRevenue / numberOfClasses : 0;
  const costPerStudent = students > 0 ? totalCosts / students : 0;
  const marginPerStudent = revenuePerStudent - costPerStudent;
  const avgNetMonthlyTicket = (monthlyTicket * (1 - discountPercent/100)) * (1 - taxPercent/100);
  const breakEvenStudents = (avgNetMonthlyTicket * projectionMonths) > 0 ? totalCosts / (avgNetMonthlyTicket * projectionMonths) : 0;

  let status: 'Atrativo' | 'Atenção' | 'Não recomendado' = 'Atenção';
  let color = 'text-amber-500';
  let reason = 'Viabilidade moderada, requer acompanhamento de custos.';

  if (irr && irr > 25 && operatingMargin > 20 && payback && payback < projectionMonths * 0.6) {
    status = 'Atrativo'; color = 'text-emerald-500'; reason = 'Alta rentabilidade e retorno rápido.';
  } else if (!irr || irr < 10 || operatingMargin < 5 || (payback && payback > projectionMonths)) {
    status = 'Não recomendado'; color = 'text-red-500'; reason = 'Baixa viabilidade ou risco elevado de retorno.';
  }

  const summary = `O projeto apresenta uma Receita Líquida de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netRevenue)} com uma Margem Operacional de ${operatingMargin.toFixed(1)}%. O investimento inicial de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(initialInvestment)} é recuperado em ${payback ? payback.toFixed(1) : 'N/A'} meses, resultando em uma TIR de ${irr ? irr.toFixed(2) : 'N/A'}%. ${reason}`;

  let levers: ValueLever[] = [];
  if (!skipLevers) {
    levers = [
      { label: 'Mensalidade (+10%)', impact: calculateFinancials({ ...inputs, monthlyTicket: monthlyTicket * 1.1 }, true).operatingResult - operatingResult, description: 'Impacto direto na margem sem aumento de custos operacionais.' },
      { label: 'Número de Alunos (+10%)', impact: calculateFinancials({ ...inputs, students: students * 1.1 }, true).operatingResult - operatingResult, description: 'Aumento de escala com diluição de custos fixos.' },
      { label: 'Redução de Descontos (-10%)', impact: calculateFinancials({ ...inputs, discountPercent: discountPercent * 0.9 }, true).operatingResult - operatingResult, description: 'Melhoria na qualidade da receita e conversão.' },
    ];
  }

  const dreLines = [
    { label: '1. Receita Bruta', value: grossRevenue, isBold: true },
    { label: '2. Descontos, Deduções & Bolsas', value: -discounts },
    { label: '3. Impostos sobre Faturamento', value: -taxes },
    { label: '4. Receita Líquida', value: netRevenue, isBold: true, isTotal: true },
    { label: '5. Custo Docente (CLT)', value: -teacherCLT, percentOfNetRevenue: netRevenue > 0 ? (teacherCLT / netRevenue) * 100 : 0 },
    { label: '6. Custo Docente (PJ)', value: -teacherPJ, percentOfNetRevenue: netRevenue > 0 ? (teacherPJ / netRevenue) * 100 : 0 },
    { label: '7. Folha Apoio e Adm.', value: -supportAdminPayroll, percentOfNetRevenue: netRevenue > 0 ? (supportAdminPayroll / netRevenue) * 100 : 0 },
    { label: '8. Serv. Terceiros', value: -thirdPartyServices, percentOfNetRevenue: netRevenue > 0 ? (thirdPartyServices / netRevenue) * 100 : 0 },
    { label: '9. Aluguel e Ocupação', value: -rentOccupation, percentOfNetRevenue: netRevenue > 0 ? (rentOccupation / netRevenue) * 100 : 0 },
    { label: '10. Manutenção', value: -maintenance, percentOfNetRevenue: netRevenue > 0 ? (maintenance / netRevenue) * 100 : 0 },
    { label: '11. Deslocamento', value: -travel, percentOfNetRevenue: netRevenue > 0 ? (travel / netRevenue) * 100 : 0 },
    { label: '12. Outros Custos/Desp. Operacionais', value: -otherOperational, percentOfNetRevenue: netRevenue > 0 ? (otherOperational / netRevenue) * 100 : 0 },
    { label: '13. Result. Operacional', value: operatingResult, isBold: true, isTotal: true },
    { label: '14. Mg. Operacional', value: operatingMargin, isBold: true },
  ];

  return {
    grossRevenue, discounts, taxes, netRevenue,
    costs: { teacherCLT, teacherPJ, supportAdminPayroll, thirdPartyServices, rentOccupation, maintenance, travel, otherOperational, total: totalCosts },
    operatingResult, operatingMargin, cashFlow, cumulativeCashFlow, payback, irr, dreLines,
    drivers: { revenuePerStudent, revenuePerClass, costPerStudent, marginPerStudent, breakEvenStudents },
    classification: { status, color, reason }, summary, levers
  };
}

export function generateSensitivityData(baseInputs: ScenarioInputs, variable: 'monthlyTicket' | 'students', range: number[]) {
  return range.map((val) => {
    const inputs = { ...baseInputs, [variable]: val };
    const results = calculateFinancials(inputs);
    return { value: val, irr: results.irr, operatingResult: results.operatingResult };
  });
}
