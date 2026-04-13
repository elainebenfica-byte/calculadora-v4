export type CostType = 'fixed' | 'percent';
export type PayrollCategory = 'apoio' | 'administrativa';

export interface PayrollItem {
  id: string;
  category: PayrollCategory;
  role: string;
  salary: number;
  quantity: number;
}

export interface CostParameter {
  type: CostType;
  value: number;
}

export interface ScenarioInputs {
  name: string;
  students: number;
  numberOfClasses: number;
  monthlyTicket: number;
  discountPercent: number;
  taxPercent: number;
  taxOnGross: boolean;
  teacherCLT: CostParameter;
  teacherPJ: CostParameter;
  payrollItems: PayrollItem[];
  thirdPartyServices: CostParameter;
  rentOccupation: CostParameter;
  maintenance: CostParameter;
  travel: CostParameter;
  otherOperational: CostParameter;
  teacherHoursPerMonth: number;
  initialInvestment: number;
  projectionMonths: number;
}

export interface DRELine {
  label: string;
  value: number;
  percentOfNetRevenue?: number;
  isBold?: boolean;
  isTotal?: boolean;
}

export interface BusinessDrivers {
  revenuePerStudent: number;
  revenuePerClass: number;
  costPerStudent: number;
  marginPerStudent: number;
  breakEvenStudents: number;
}

export interface ValueLever {
  label: string;
  impact: number;
  description: string;
}

export interface FinancialResult {
  grossRevenue: number;
  discounts: number;
  taxes: number;
  netRevenue: number;
  costs: {
    teacherCLT: number;
    teacherPJ: number;
    supportAdminPayroll: number;
    thirdPartyServices: number;
    rentOccupation: number;
    maintenance: number;
    travel: number;
    otherOperational: number;
    total: number;
  };
  operatingResult: number;
  operatingMargin: number;
  cashFlow: number[];
  cumulativeCashFlow: number[];
  payback: number | null;
  irr: number | null;
  dreLines: DRELine[];
  drivers: BusinessDrivers;
  classification: {
    status: 'Atrativo' | 'Atenção' | 'Não recomendado';
    color: string;
    reason: string;
  };
  summary: string;
  levers: ValueLever[];
}

export interface Scenario {
  id: string;
  inputs: ScenarioInputs;
  results: FinancialResult;
}
