export const ASSETS = Object.freeze({ BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano', DOGE: 'Dogecoin', AVAX: 'Avalanche', DOT: 'Polkadot', LINK: 'Chainlink', LTC: 'Litecoin' });
export const INTERVALS = Object.freeze([1, 5, 15, 30, 60, 240, 1440, 5760]);
const invalid = message => Object.assign(new Error(message), { status: 400, code: 'INVALID_PORTFOLIO' });
const numeric = (value, label, { positive = false, optional = false } = {}) => {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (value === '' || value === null || typeof value === 'boolean') throw invalid(`${label} must be a number.`);
  const n = Number(value);
  if (!Number.isFinite(n) || (positive ? n <= 0 : n < 0) || n > 1e12) throw invalid(`${label} must be ${positive ? 'positive' : 'nonnegative'} and finite.`);
  return n;
};
export function validateTrade(input) {
  if (!input || Object.keys(input).some(k => !['id', 'asset', 'type', 'quantity', 'price', 'fees', 'at'].includes(k))) throw invalid('Choose an asset, transaction type, quantity, price, fees and time.');
  if (!Object.hasOwn(ASSETS, input.asset) || !['opening', 'buy', 'sell'].includes(input.type)) throw invalid('Choose a supported asset and transaction type.');
  const at = new Date(input.at);
  if (typeof input.at !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(input.at) || Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60000) throw invalid('Choose a valid transaction time with a timezone, no later than now.');
  const quantity = numeric(input.quantity, 'Quantity', { positive: true });
  const price = numeric(input.price, 'USD price', { positive: true, optional: input.type === 'opening' });
  const fees = numeric(input.fees ?? 0, 'USD fees');
  if (input.type === 'sell' && fees > quantity * price) throw invalid('Sell fees cannot exceed proceeds.');
  if (price === null && fees) throw invalid('Unknown opening cost basis cannot have a known fee.');
  return { asset: input.asset, type: input.type, quantity, price, fees, at: at.toISOString() };
}

// Weighted-average cost basis in USD. Unknown opening basis stays unknown until
// that position is fully closed; realized results from it are also unknown.
export function portfolioReport(trades, prices = {}) {
  const positions = new Map();
  for (const trade of [...trades].sort((a, b) => a.at.localeCompare(b.at) || (a.sequence || 0) - (b.sequence || 0) || a.id.localeCompare(b.id))) {
    const t = validateTrade(trade.fields || Object.fromEntries(['asset','type','quantity','price','fees','at'].map(k => [k,trade[k]])));
    const p = positions.get(t.asset) || { asset: t.asset, quantity: 0, cost: 0, realized: 0, realizedKnown: true, basisKnown: true };
    if (t.type === 'sell') {
      if (t.quantity > p.quantity * (1 + 1e-12) || !p.quantity) throw invalid(`The ${t.asset} sale exceeds holdings at its transaction time.`);
      const removed = p.cost * Math.min(1, t.quantity / p.quantity);
      if (p.basisKnown) p.realized += t.quantity * t.price - t.fees - removed;
      else p.realizedKnown = false;
      const previousQuantity = p.quantity;
      p.cost -= removed; p.quantity -= t.quantity;
      if (p.quantity <= previousQuantity * Number.EPSILON * 8) { p.quantity = 0; p.cost = 0; p.basisKnown = true; }
    } else {
      p.quantity += t.quantity;
      if (t.price === null) p.basisKnown = false;
      else p.cost += t.quantity * t.price + t.fees;
    }
    positions.set(t.asset, p);
  }
  const rows = [...positions.values()].map(p => {
    const price = Number.isFinite(prices[p.asset]?.price) && prices[p.asset].price > 0 ? prices[p.asset].price : null;
    const value = p.quantity === 0 ? 0 : price === null ? null : p.quantity * price;
    return { asset: p.asset, quantity: p.quantity, price, value, costBasis: p.basisKnown ? p.cost : null, averageCost: p.basisKnown && p.quantity ? p.cost / p.quantity : null, unrealized: p.basisKnown && value !== null ? value - p.cost : null, realized: p.realizedKnown ? p.realized : null, priceAt: prices[p.asset]?.fetchedAt || null, provider: prices[p.asset]?.provider || null };
  });
  const valuationComplete = rows.every(p => p.value !== null), totalValue = rows.reduce((sum, p) => sum + (p.value || 0), 0);
  return { currency: 'USD', method: 'Weighted-average cost basis including USD fees; unknown opening basis remains unknown.', positions: rows.map(p => ({ ...p, allocation: valuationComplete && totalValue > 0 && p.value !== null ? p.value / totalValue : null })), valuationComplete, totalValue: valuationComplete ? totalValue : null, knownValue: totalValue,
    unrealized: rows.every(p => p.unrealized !== null) ? rows.reduce((s, p) => s + p.unrealized, 0) : null, realized: rows.every(p => p.realized !== null) ? rows.reduce((s, p) => s + p.realized, 0) : null };
}

export function validateRiskProfile(input) {
  if (!input || Object.keys(input).some(k => !['goal', 'horizon', 'riskTolerance', 'budget', 'liquidityNeeds'].includes(k))) throw invalid('Enter the investment profile fields.');
  if (typeof input.goal !== 'string' || !input.goal.trim() || input.goal.length > 600 || typeof input.liquidityNeeds !== 'string' || !input.liquidityNeeds.trim() || input.liquidityNeeds.length > 600) throw invalid('Describe your goal and liquidity needs in 1–600 characters each.');
  if (!['under-1-year', '1-3-years', '3-plus-years'].includes(input.horizon) || !['low', 'medium', 'high'].includes(input.riskTolerance)) throw invalid('Choose a time horizon and risk tolerance.');
  return { goal: input.goal.trim(), horizon: input.horizon, riskTolerance: input.riskTolerance, budget: numeric(input.budget, 'Available USD investment budget'), liquidityNeeds: input.liquidityNeeds.trim() };
}

export function candleIndicators(candles) {
  const closes = candles.filter(c => c.closed).map(c => c.close);
  const average = n => closes.length >= n ? closes.slice(-n).reduce((s, n) => s + n, 0) / n : null;
  let rsi14 = null;
  if (closes.length >= 15) { let gains = 0, losses = 0; for (let i = closes.length - 14; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; gains += Math.max(d, 0); losses += Math.max(-d, 0); } rsi14 = gains + losses === 0 ? 50 : losses === 0 ? 100 : 100 - 100 / (1 + gains / losses); }
  return { sma20: average(20), sma50: average(50), rsi14, rsiMethod: 'Simple 14-change relative strength; closed candles only.', closedCandles: closes.length };
}
