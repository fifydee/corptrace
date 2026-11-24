export type ProfitableCompany = {
  rank: number;
  name: string;
  ticker: string;
  country: string;
  sector: string;
  business: string;
  profitUsdBillions: number;
  profitPeriod: string;
};

export const rankingSource = {
  title: "Ranked: The World's Most Profitable Companies in 2025",
  publisher: "Visual Capitalist, using FinanceCharts data",
  url: "https://www.visualcapitalist.com/ranked-the-worlds-most-profitable-companies-in-2025/",
  asOf: "November 2025",
  metric: "Trailing twelve-month net income",
  caveat: "A dated third-party snapshot. Reporting periods differ by company; amounts are rounded and should be checked against the linked company filings before formal comparison."
};

export const topProfitableCompanies: ProfitableCompany[] = [
  { rank: 1, name: "Alphabet", ticker: "GOOGL", country: "United States", sector: "Technology", business: "Search, advertising, cloud and technology platforms.", profitUsdBillions: 124.3, profitPeriod: "TTM · Nov 2025" },
  { rank: 2, name: "Apple", ticker: "AAPL", country: "United States", sector: "Consumer technology", business: "Consumer devices, software and digital services.", profitUsdBillions: 112.0, profitPeriod: "TTM · Nov 2025" },
  { rank: 3, name: "Microsoft", ticker: "MSFT", country: "United States", sector: "Software & cloud", business: "Software, cloud services and productivity platforms.", profitUsdBillions: 104.9, profitPeriod: "TTM · Nov 2025" },
  { rank: 4, name: "NVIDIA", ticker: "NVDA", country: "United States", sector: "Semiconductors", business: "Accelerated computing, GPUs and AI infrastructure.", profitUsdBillions: 99.2, profitPeriod: "TTM · Nov 2025" },
  { rank: 5, name: "Saudi Aramco", ticker: "2222", country: "Saudi Arabia", sector: "Energy", business: "Integrated oil, gas, refining and chemicals.", profitUsdBillions: 95.6, profitPeriod: "TTM · Nov 2025" },
  { rank: 6, name: "Amazon", ticker: "AMZN", country: "United States", sector: "Retail & cloud", business: "E-commerce, logistics, advertising and cloud computing.", profitUsdBillions: 76.5, profitPeriod: "TTM · Nov 2025" },
  { rank: 7, name: "Berkshire Hathaway", ticker: "BRK.B", country: "United States", sector: "Financials", business: "Diversified holding company with insurance, operating businesses and investments.", profitUsdBillions: 67.5, profitPeriod: "TTM · Nov 2025" },
  { rank: 8, name: "Meta Platforms", ticker: "META", country: "United States", sector: "Technology", business: "Social platforms, digital advertising and AI.", profitUsdBillions: 58.5, profitPeriod: "TTM · Nov 2025" },
  { rank: 9, name: "JPMorgan Chase", ticker: "JPM", country: "United States", sector: "Financials", business: "Consumer, commercial and investment banking.", profitUsdBillions: 56.7, profitPeriod: "TTM · Nov 2025" },
  { rank: 10, name: "Taiwan Semiconductor Manufacturing", ticker: "TSM", country: "Taiwan", sector: "Semiconductors", business: "Advanced semiconductor manufacturing and foundry services.", profitUsdBillions: 50.5, profitPeriod: "TTM · Nov 2025" },
  { rank: 11, name: "Industrial and Commercial Bank of China", ticker: "1398", country: "China", sector: "Banking", business: "Commercial banking and financial services.", profitUsdBillions: 49.9, profitPeriod: "TTM · Nov 2025" },
  { rank: 12, name: "China Construction Bank", ticker: "0939", country: "China", sector: "Banking", business: "Commercial banking, corporate finance and retail banking.", profitUsdBillions: 46.4, profitPeriod: "TTM · Nov 2025" },
  { rank: 13, name: "Agricultural Bank of China", ticker: "1288", country: "China", sector: "Banking", business: "Commercial banking with a major rural and agricultural finance franchise.", profitUsdBillions: 38.5, profitPeriod: "TTM · Nov 2025" },
  { rank: 14, name: "Bank of China", ticker: "3988", country: "China", sector: "Banking", business: "Commercial banking and international financial services.", profitUsdBillions: 31.4, profitPeriod: "TTM · Nov 2025" },
  { rank: 15, name: "Exxon Mobil", ticker: "XOM", country: "United States", sector: "Energy", business: "Oil, gas, refining, chemicals and lower-carbon energy investments.", profitUsdBillions: 30.0, profitPeriod: "TTM · Nov 2025" },
  { rank: 16, name: "HSBC Holdings", ticker: "HSBC", country: "United Kingdom", sector: "Banking", business: "International banking and financial services.", profitUsdBillions: 29.6, profitPeriod: "TTM · Nov 2025" },
  { rank: 17, name: "Toyota Motor", ticker: "TM", country: "Japan", sector: "Automotive", business: "Global vehicle manufacturing, mobility and financial services.", profitUsdBillions: 29.5, profitPeriod: "TTM · Nov 2025" },
  { rank: 18, name: "Tencent Holdings", ticker: "0700", country: "China", sector: "Technology", business: "Digital platforms, gaming, social networks and fintech.", profitUsdBillions: 29.3, profitPeriod: "TTM · Nov 2025" },
  { rank: 19, name: "Bank of America", ticker: "BAC", country: "United States", sector: "Financials", business: "Consumer, commercial and investment banking.", profitUsdBillions: 28.3, profitPeriod: "TTM · Nov 2025" },
  { rank: 20, name: "Johnson & Johnson", ticker: "JNJ", country: "United States", sector: "Healthcare", business: "Innovative medicines and medical technologies.", profitUsdBillions: 25.1, profitPeriod: "TTM · Nov 2025" },
];

export const companies = topProfitableCompanies.map(company => [
  company.ticker, company.name, company.sector, company.country, company.business,
]);
