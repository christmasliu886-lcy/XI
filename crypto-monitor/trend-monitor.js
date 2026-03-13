#!/usr/bin/env node

/**
 * Crypto Trend Trading System
 * Monitors BTC/ETH with technical indicators
 * Generates trend signals and alerts
 */

const SYMBOLS = [
  { base: 'BTC', quote: 'USDT', threshold: 70000, interval: '15m' },
  { base: 'ETH', quote: 'USDT', threshold: 2000, interval: '15m' },
];

// Trading settings
const TREND_PERIOD = 20; // MA period
const RSI_PERIOD = 14;
const VOLUME_MULTIPLIER = 1.5; // Volume must be 1.5x average to confirm
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// State
let lastSignals = {}; // Track last signals to avoid spam

// Fetch Klines (candlestick data)
async function getKlines(symbol, interval, limit = 100) {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    const data = await response.json();
    return data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (error) {
    console.error(`Error fetching klines for ${symbol}:`, error.message);
    return null;
  }
}

// Calculate Simple Moving Average
function calculateSMA(data, period) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      sma.push(sum / period);
    }
  }
  return sma;
}

// Calculate RSI
function calculateRSI(data, period = 14) {
  const rsi = [];
  let gains = 0;
  let losses = 0;
  
  // First calculate average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // First RSI value
  const rs = avgGain / (avgLoss || 0.0001);
  rsi.push(100 - (100 / (1 + rs)));
  
  // Calculate subsequent RSI values using smoothed averages
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    const rs = avgGain / (avgLoss || 0.0001);
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  // Pad the beginning
  for (let i = 0; i <= period; i++) {
    rsi.unshift(null);
  }
  
  return rsi;
}

// Calculate average volume
function calculateAvgVolume(data, period = 20) {
  let sum = 0;
  for (let i = data.length - period; i < data.length; i++) {
    sum += data[i].volume;
  }
  return sum / period;
}

// Analyze trend
function analyzeTrend(klines, symbol) {
  if (!klines || klines.length < 50) return null;
  
  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  
  // Calculate indicators
  const sma20 = calculateSMA(klines, TREND_PERIOD);
  const rsi = calculateRSI(klines, RSI_PERIOD);
  const avgVolume = calculateAvgVolume(klines, 20);
  
  const currentPrice = closes[closes.length - 1];
  const currentSMA = sma20[sma20.length - 1];
  const currentRSI = rsi[rsi.length - 1];
  const currentVolume = volumes[volumes.length - 1];
  
  // Previous values for comparison
  const prevPrice = closes[closes.length - 2];
  const prevSMA = sma20[sma20.length - 2];
  const prevRSI = rsi[rsi.length - 2];
  
  // Determine trend
  const isUptrend = currentPrice > currentSMA && currentSMA > prevSMA;
  const isDowntrend = currentPrice < currentSMA && currentSMA < prevSMA;
  const isVolumeHigh = currentVolume > avgVolume * VOLUME_MULTIPLIER;
  
  // Generate signals
  const signals = [];
  
  // Long signal: price crosses above SMA + RSI not overbought + high volume
  const priceCrossUp = prevPrice < prevSMA && currentPrice > currentSMA;
  if (priceCrossUp && currentRSI < 70 && isVolumeHigh) {
    signals.push({
      type: 'LONG',
      reason: '突破均线 + 成交量放大',
      price: currentPrice,
      rsi: currentRSI,
      volume: currentVolume,
      avgVolume: avgVolume
    });
  }
  
  // Short signal: price crosses below SMA + RSI not oversold + high volume
  const priceCrossDown = prevPrice > prevSMA && currentPrice < currentSMA;
  if (priceCrossDown && currentRSI > 30 && isVolumeHigh) {
    signals.push({
      type: 'SHORT',
      reason: '跌破均线 + 成交量放大',
      price: currentPrice,
      rsi: currentRSI,
      volume: currentVolume,
      avgVolume: avgVolume
    });
  }
  
  // RSI overbought warning
  if (currentRSI > 75 && isUptrend) {
    signals.push({
      type: 'WARNING',
      reason: 'RSI超买，注意回调',
      price: currentPrice,
      rsi: currentRSI
    });
  }
  
  // RSI oversold warning
  if (currentRSI < 25 && isDowntrend) {
    signals.push({
      type: 'WARNING',
      reason: 'RSI超卖，注意反弹',
      price: currentPrice,
      rsi: currentRSI
    });
  }
  
  return {
    symbol,
    price: currentPrice,
    sma: currentSMA,
    rsi: currentRSI,
    volume: currentVolume,
    avgVolume,
    volumeRatio: currentVolume / avgVolume,
    trend: isUptrend ? '📈 上涨' : isDowntrend ? '📉 下跌' : '➡️ 震荡',
    signals
  };
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
  console.log(`\n[${new Date().toISOString()}] Analyzing trends...`);
  
  for (const { base, quote, threshold, interval } of SYMBOLS) {
    const symbol = `${base}${quote}`;
    const klines = await getKlines(symbol, interval);
    
    if (!klines) continue;
    
    const analysis = analyzeTrend(klines, symbol);
    if (!analysis) continue;
    
    console.log(`${symbol}: Price=${analysis.price.toFixed(2)}, SMA=${analysis.sma.toFixed(2)}, RSI=${analysis.rsi.toFixed(1)}, Trend=${analysis.trend}`);
    
    // Check for trading signals
    for (const signal of analysis.signals) {
      const signalKey = `${symbol}-${signal.type}-${signal.reason}`;
      const now = Date.now();
      
      // Only alert on new signals, not repeated
      if (!lastSignals[signalKey] || now - lastSignals[signalKey] > 30 * 60 * 1000) { // 30 min cooldown
        let msg = '';
        
        if (signal.type === 'LONG') {
          msg = `🟢 <b>做多信号</b>\n\n${symbol}\n💰 价格: $${signal.price.toLocaleString()}\n📊 RSI: ${signal.rsi.toFixed(1)}\n📈 成交量: ${signal.volume.toFixed(0)} (${(signal.volume/signal.avgVolume).toFixed(1)}x 平均)\n💡 原因: ${signal.reason}\n⏰ ${new Date().toLocaleString()}`;
        } else if (signal.type === 'SHORT') {
          msg = `🔴 <b>做空信号</b>\n\n${symbol}\n💰 价格: $${signal.price.toLocaleString()}\n📊 RSI: ${signal.rsi.toFixed(1)}\n📈 成交量: ${signal.volume.toFixed(0)} (${(signal.volume/signal.avgVolume).toFixed(1)}x 平均)\n💡 原因: ${signal.reason}\n⏰ ${new Date().toLocaleString()}`;
        } else if (signal.type === 'WARNING') {
          msg = `⚠️ <b>市场预警</b>\n\n${symbol}\n💰 价格: $${signal.price.toLocaleString()}\n📊 RSI: ${signal.rsi.toFixed(1)}\n💡 ${signal.reason}\n⏰ ${new Date().toLocaleString()}`;
        }
        
        if (msg) {
          console.log('Signal:', msg);
          await sendAlert(msg);
          lastSignals[signalKey] = now;
        }
      }
    }
    
    // Also send periodic summary (every hour)
    const summaryKey = `${symbol}-summary`;
    const now = Date.now();
    if (!lastSignals[summaryKey] || now - lastSignals[summaryKey] > 60 * 60 * 1000) {
      const msg = `📊 <b>定时报告</b>\n\n${symbol}\n💰 价格: $${analysis.price.toLocaleString()}\n📈 趋势: ${analysis.trend}\n📉 SMA(20): $${analysis.sma.toLocaleString()}\n📊 RSI(14): ${analysis.rsi.toFixed(1)}\n📊 成交量: ${(analysis.volumeRatio).toFixed(1)}x 平均\n⏰ ${new Date().toLocaleString()}`;
      console.log('Summary:', msg);
      await sendAlert(msg);
      lastSignals[summaryKey] = now;
    }
  }
}

// Run once on start
console.log('🚀 Crypto Trend Trading System Started');
console.log(`Monitoring: ${SYMBOLS.map(s => `${s.base}/${s.quote}`).join(', ')}`);
console.log(`Timeframe: ${SYMBOLS[0].interval}, MA Period: ${TREND_PERIOD}, RSI Period: ${RSI_PERIOD}`);
monitor();

// Then run periodically
setInterval(monitor, CHECK_INTERVAL);
