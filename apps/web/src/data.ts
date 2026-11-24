export type ProfitableCompany = {
  rank: number;
  name: string;
  ticker: string;
  country: string;
  sector: string;
  business: string;
  rankingPeriod: string;
  profitUsdBillions: number | null;
};

export const topProfitableCompanies: ProfitableCompany[] = [
  { rank: 1, name: "Alphabet", ticker: "GOOGL", country: "United States", sector: "Technology", business: "Search, advertising, cloud and technology platforms.", rankingPeriod: "FY2025", profitUsdBillions: 132.2 },
  { rank: 2, name: "NVIDIA", ticker: "NVDA", country: "United States", sector: "Semiconductors", business: "Accelerated computing, GPUs and AI infrastructure.", rankingPeriod: "FY2025", profitUsdBillions: 120.1 },
  { rank: 3, name: "Apple", ticker: "AAPL", country: "United States", sector: "Consumer technology", business: "Consumer devices, software and digital services.", rankingPeriod: "FY2025", profitUsdBillions: 112.0 },
  { rank: 4, name: "Microsoft", ticker: "MSFT", country: "United States", sector: "Software & cloud", business: "Software, cloud services and productivity platforms.", rankingPeriod: "FY2025", profitUsdBillions: 101.8 },
  { rank: 5, name: "Saudi Aramco", ticker: "2222", country: "Saudi Arabia", sector: "Energy", business: "Integrated oil, gas, refining and chemicals.", rankingPeriod: "FY2025", profitUsdBillions: 92.8 },
  { rank: 6, name: "Amazon", ticker: "AMZN", country: "United States", sector: "Retail & cloud", business: "E-commerce, logistics, advertising and cloud computing.", rankingPeriod: "FY2025", profitUsdBillions: null },
  { rank: 7, name: "Berkshire Hathaway", ticker: "BRK.B", country: "United States", sector: "Financials", business: "Diversified holding company with insurance, operating businesses and investments.", rankingPeriod: "FY2025", profitUsdBillions: null },
  { rank: 8, name: "Meta Platforms", ticker: "META", country: "United States", sector: "Technology", business: "Social platforms, digital advertising and AI.", rankingPeriod: "FY2025", profitUsdBillions: null },
  { rank: 9, name: "JPMorgan Chase", ticker: "JPM", country: "United States", sector: "Financials", business: "Consumer, commercial and investment banking.", rankingPeriod: "FY2025", profitUsdBillions: null },
  { rank: 10, name: "Taiwan Semiconductor Manufacturing", ticker: "TSM", country: "Taiwan", sector: "Semiconductors", business: "Advanced semiconductor manufacturing and foundry services.", rankingPeriod: "FY2025", profitUsdBillions: null },
  { rank: 11, name: "Samsung Electronics", ticker: "005930", country: "South Korea", sector: "Technology", business: "Semiconductors, consumer electronics and mobile devices.", rankingPeriod: "FY2025", profitUsdBillions: 58.5 },
  { rank: 12, name: "SK hynix", ticker: "000660", country: "South Korea", sector: "Semiconductors", business: "Memory chips and high-bandwidth memory for AI systems.", rankingPeriod: "FY2025", profitUsdBillions: 52.7 },
  { rank: 13, name: "Industrial and Commercial Bank of China", ticker: "1398", country: "China", sector: "Banking", business: "Commercial banking and financial services.", rankingPeriod: "FY2025", profitUsdBillions: 51.3 },
  { rank: 14, name: "China Construction Bank", ticker: "0939", country: "China", sector: "Banking", business: "Commercial banking, corporate finance and retail banking.", rankingPeriod: "FY2025", profitUsdBillions: 48.2 },
  { rank: 15, name: "Agricultural Bank of China", ticker: "1288", country: "China", sector: "Banking", business: "Commercial banking with a major rural and agricultural finance franchise.", rankingPeriod: "FY2025", profitUsdBillions: 39.2 },
  { rank: 16, name: "Bank of China", ticker: "3988", country: "China", sector: "Banking", business: "Commercial banking and international financial services.", rankingPeriod: "FY2025", profitUsdBillions: 34.5 },
  { rank: 17, name: "Tencent Holdings", ticker: "0700", country: "China", sector: "Technology", business: "Digital platforms, gaming, social networks and fintech.", rankingPeriod: "FY2025", profitUsdBillions: 33.1 },
  { rank: 18, name: "SoftBank Group", ticker: "9984", country: "Japan", sector: "Technology & investments", business: "Technology investment holding company and telecommunications.", rankingPeriod: "FY2025", profitUsdBillions: 33.1 },
  { rank: 19, name: "Bank of America", ticker: "BAC", country: "United States", sector: "Financials", business: "Consumer, commercial and investment banking.", rankingPeriod: "FY2025", profitUsdBillions: 31.8 },
  { rank: 20, name: "Toyota Motor", ticker: "TM", country: "Japan", sector: "Automotive", business: "Global vehicle manufacturing, mobility and financial services.", rankingPeriod: "FY2025", profitUsdBillions: 25.5 },
];

export const companies = topProfitableCompanies.map(company => [
  company.ticker, company.name, company.sector, company.country, company.business,
]);
