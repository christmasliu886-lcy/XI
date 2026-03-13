/**
 * 技术指标计算模块
 */

// 简单移动平均线 (SMA)
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

// 指数移动平均线 (EMA)
function calculateEMA(data, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  // 初始 SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
    ema.push(null);
  }
  ema[period - 1] = sum / period;
  
  // 计算 EMA
  for (let i = period; i < data.length; i++) {
    const current = (data[i].close - ema[i - 1]) * multiplier + ema[i - 1];
    ema.push(current);
  }
  
  return ema;
}

// 成交量移动平均
function calculateVolumeSMA(data, period) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].volume;
      }
      sma.push(sum / period);
    }
  }
  return sma;
}

// RSI 计算
function calculateRSI(data, period = 14) {
  const rsi = [];
  let gains = 0;
  let losses = 0;
  
  // 初始平均
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // 第一个 RSI
  const rs = avgGain / (avgLoss || 0.0001);
  rsi.push(100 - (100 / (1 + rs)));
  
  // 后续 RSI (平滑)
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    const rs = avgGain / (avgLoss || 0.0001);
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  // 补齐前面的 null
  for (let i = 0; i <= period; i++) {
    rsi.unshift(null);
  }
  
  return rsi;
}

// ATR (平均真实波幅)
function calculateATR(data, period = 14) {
  const atr = [];
  const tr = [];
  
  // 计算 True Range
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    
    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    
    tr.push(Math.max(tr1, tr2, tr3));
  }
  
  // 计算 ATR
  for (let i = 0; i < period - 1; i++) {
    atr.push(null);
  }
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i];
  }
  atr.push(sum / period);
  
  for (let i = period; i < tr.length; i++) {
    const current = (atr[atr.length - 1] * (period - 1) + tr[i]) / period;
    atr.push(current);
  }
  
  return atr;
}

// 判断趋势方向
function getTrendDirection(klines, period = 20) {
  if (!klines || klines.length < period) return 'unknown';
  
  const sma = calculateSMA(klines, period);
  const currentPrice = klines[klines.length - 1].close;
  const currentSMA = sma[sma.length - 1];
  const prevSMA = sma[sma.length - 2];
  
  if (currentPrice > currentSMA && currentSMA > prevSMA) {
    return 'uptrend';  // 上涨趋势
  } else if (currentPrice < currentSMA && currentSMA < prevSMA) {
    return 'downtrend';  // 下跌趋势
  } else {
    return 'sideways';  // 震荡
  }
}

// 计算当前成交量相对7日均量的比例
function getVolumeRatio(klines, period = 7) {
  const currentVolume = klines[klines.length - 1].volume;
  const volumes = klines.slice(-period).map(k => k.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  
  return currentVolume / avgVolume;
}

// 检测量价背离
function detectVolumePriceDivergence(klines) {
  if (klines.length < 3) return null;
  
  const recent = klines.slice(-3);  // 最近3根K线
  const volumeRatio = getVolumeRatio(klines);
  
  // 检测上涨中的缩量（顶背离）
  if (recent[2].close > recent[1].close && 
      recent[1].close > recent[0].close &&
      recent[2].volume < recent[1].volume &&
      recent[1].volume < recent[0].volume) {
    return 'bearish_divergence';  // 顶背离，做空信号
  }
  
  // 检测下跌中的缩量（底背离）
  if (recent[2].close < recent[1].close && 
      recent[1].close < recent[0].close &&
      recent[2].volume < recent[1].volume &&
      recent[1].volume < recent[0].volume) {
    return 'bullish_divergence';  // 底背离，做多信号
  }
  
  // 单根K线缩量
  if (volumeRatio < 0.5) {
    const lastClose = klines[klines.length - 1].close;
    const prevClose = klines[klines.length - 2].close;
    
    if (lastClose < prevClose) {
      return 'bullish_divergence';  // 跌且缩量，可能反弹
    } else if (lastClose > prevClose) {
      return 'bearish_divergence';  // 涨且缩量，可能回落
    }
  }
  
  return null;
}

module.exports = {
  calculateSMA,
  calculateEMA,
  calculateVolumeSMA,
  calculateRSI,
  calculateATR,
  getTrendDirection,
  getVolumeRatio,
  detectVolumePriceDivergence
};
