#!/usr/bin/env node

/**
 * Crypto Price Monitor
 * Monitors BTC and ETH prices on Binance (spot & futures)
 * Alerts when price crosses threshold or abnormal fluctuation detected
 * Includes order book large order monitoring
 */

const SYMBOLS = [
  { base: 'BTC', quote: 'USDT', threshold: 70000, largeOrderThreshold: 1 }, // 1 BTC+
  { base: 'ETH', quote: 'USDT', threshold: 2000, largeOrderThreshold: 10 },  // 10 ETH+
];

const FLUCTUATION_THRESHOLD = 0.03; // 3%
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

let lastPrices = {}; // { 'BTCUSDT': { spot: null, futures: null, timestamp: null } }
let lastLargeOrders = {}; // Track last large order alerts to avoid spam

// Fetch price from Binance spot API
async function getSpotPrice(symbol) {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error(`Error fetching spot price for ${symbol}:`, error.message);
    return null;
  }
}

// Fetch price from Binance futures API (mark price)
async function getFuturesPrice(symbol) {
  try {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
    const data = await response.json();
    return parseFloat(data.markPrice);
  } catch (error) {
    console.error(`Error fetching futures price for ${symbol}:`, error.message);
    return null;
  }
}

// Fetch order book depth (top 20 bids/asks)
async function getOrderBook(symbol) {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=20`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching order book for ${symbol}:`, error.message);
    return null;
  }
}

// Check for large orders in order book
async function checkLargeOrders(symbol, threshold) {
  const orderBook = await getOrderBook(symbol);
  if (!orderBook) return;
  
  // Check asks (sell orders) - sorted from lowest ask price
  const largeAsks = orderBook.asks
    .map(ask => ({ price: parseFloat(ask[0]), qty: parseFloat(ask[1]) }))
    .filter(ask => ask.qty >= threshold);
  
  // Check bids (buy orders) - sorted from highest bid price
  const largeBids = orderBook.bids
    .map(bid => ({ price: parseFloat(bid[0]), qty: parseFloat(bid[1]) }))
    .filter(bid => bid.qty >= threshold);
  
  const now = Date.now();
  const key = symbol;
  
  // Alert on large asks (sell walls)
  if (largeAsks.length > 0) {
    const topAsk = largeAsks[0];
    const alertKey = `${key}-ask-${topAsk.price}`;
    if (!lastLargeOrders[alertKey] || now - lastLargeOrders[alertKey] > 15 * 60 * 1000) { // Only alert every 15 min
      const totalQty = largeAsks.reduce((sum, a) => sum + a.qty, 0);
      const msg = `🔔 <b>大单监控</b>\n\n🚨 <b>卖盘大单</b>\n${symbol} 出现大额卖单\n💰 价格: $${topAsk.price.toLocaleString()}\n📊 数量: ${topAsk.qty.toFixed(4)} BTC\n📈 累计 (≥${threshold} BTC): ${totalQty.toFixed(4)} BTC\n⏰ ${new Date().toLocaleString()}`;
      console.log('Large Order Alert:', msg);
      await sendAlert(msg);
      lastLargeOrders[alertKey] = now;
    }
  }
  
  // Alert on large bids (buy walls)
  if (largeBids.length > 0) {
    const topBid = largeBids[0];
    const alertKey = `${key}-bid-${topBid.price}`;
    if (!lastLargeOrders[alertKey] || now - lastLargeOrders[alertKey] > 15 * 60 * 1000) {
      const totalQty = largeBids.reduce((sum, b) => sum + b.qty, 0);
      const msg = `🔔 <b>大单监控</b>\n\n🚨 <b>买盘大单</b>\n${symbol} 出现大额买单\n💰 价格: $${topBid.price.toLocaleString()}\n📊 数量: ${topBid.qty.toFixed(4)} BTC\n📈 累计 (≥${threshold} BTC): ${totalQty.toFixed(4)} BTC\n⏰ ${new Date().toLocaleString()}`;
      console.log('Large Order Alert:', msg);
      await sendAlert(msg);
      lastLargeOrders[alertKey] = now;
    }
  }
}

// Calculate fluctuation percentage
function calculateFluctuation(current, previous) {
  if (!previous || previous === 0) return 0;
  return Math.abs((current - previous) / previous);
}

// Check if we should alert
function shouldAlert(symbol, type, currentPrice, lastPrice) {
  if (!lastPrice) return false;
  
  // Check threshold crossing
  const symbolConfig = SYMBOLS.find(s => `${s.base}${s.quote}` === symbol);
  if (symbolConfig) {
    const crossedUp = lastPrice < symbolConfig.threshold && currentPrice >= symbolConfig.threshold;
    const crossedDown = lastPrice > symbolConfig.threshold && currentPrice <= symbolConfig.threshold;
    if (crossedUp || crossedDown) return 'threshold';
  }
  
  // Check fluctuation
  const fluctuation = calculateFluctuation(currentPrice, lastPrice);
  if (fluctuation >= FLUCTUATION_THRESHOLD) return 'fluctuation';
  
  return false;
}

// Send alert via Telegram
async function sendAlert(message) {
  try {
    const token = '8735180834:AAEFJSOuT7O3nCC_H5WnWDoSDz-UlBWgxJk';
    const chatId = '7315773508';
    
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    
    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram send failed:', data.description);
    }
    return data.ok;
  } catch (error) {
    console.error('Error sending Telegram alert:', error.message);
    return false;
  }
}

// Main monitoring loop
async function monitor() {
  console.log(`\n[${new Date().toISOString()}] Checking prices...`);
  
  for (const { base, quote, threshold, largeOrderThreshold } of SYMBOLS) {
    const symbol = `${base}${quote}`;
    
    // Get current prices
    const spotPrice = await getSpotPrice(symbol);
    const futuresPrice = await getFuturesPrice(`${symbol}`);
    
    console.log(`${symbol} - Spot: ${spotPrice}, Futures: ${futuresPrice}`);
    
    // Initialize if first time
    if (!lastPrices[symbol]) {
      lastPrices[symbol] = { spot: spotPrice, futures: futuresPrice, timestamp: Date.now() };
      continue;
    }
    
    // Check spot price alerts
    if (spotPrice) {
      const alertType = shouldAlert(symbol, 'spot', spotPrice, lastPrices[symbol].spot);
      if (alertType) {
        const direction = spotPrice > lastPrices[symbol].spot ? '📈 突破上涨' : '📉 突破下跌';
        const msg = `🔔 <b>Crypto Alert</b>\n\n${direction} ${symbol} 现货\n💰 当前: $${spotPrice.toLocaleString()}\n🎯 目标: $${threshold.toLocaleString()}\n⏰ ${new Date().toLocaleString()}`;
        console.log('Alert:', msg);
        await sendAlert(msg);
      }
      lastPrices[symbol].spot = spotPrice;
    }
    
    // Check futures price alerts
    if (futuresPrice) {
      const alertType = shouldAlert(symbol, 'futures', futuresPrice, lastPrices[symbol].futures);
      if (alertType) {
        const direction = futuresPrice > lastPrices[symbol].futures ? '📈 突破上涨' : '📉 突破下跌';
        const msg = `🔔 <b>Crypto Alert</b>\n\n${direction} ${symbol} 合约\n💰 当前: $${futuresPrice.toLocaleString()}\n🎯 目标: $${threshold.toLocaleString()}\n⏰ ${new Date().toLocaleString()}`;
        console.log('Alert:', msg);
        await sendAlert(msg);
      }
      lastPrices[symbol].futures = futuresPrice;
    }
    
    // Check order book large orders
    await checkLargeOrders(symbol, largeOrderThreshold);
  }
}

// Run once on start
console.log('🚀 Crypto Price Monitor Started');
console.log(`Monitoring: ${SYMBOLS.map(s => `${s.base}/${s.quote} (Target: $${s.threshold}, Large Order: ≥${s.largeOrderThreshold} ${s.base})`).join(', ')}`);
console.log(`Fluctuation alert: >${FLUCTUATION_THRESHOLD * 100}%`);
monitor();

// Then run periodically
setInterval(monitor, CHECK_INTERVAL);
