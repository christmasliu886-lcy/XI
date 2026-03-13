/**
 * 信号生成模块
 * 判断是否产生交易信号
 */

const config = require('./config');
const data = require('./data');
const indicators = require('./indicators');

// 获取所有周期的K线数据
async function fetchAllTimeframes() {
  const intervals = [
    config.INTERVALS.ENTRY,
    config.INTERVALS.CONFIRM,
    config.INTERVALS.MAJOR_1H,
    config.INTERVALS.MAJOR_4H,
    config.INTERVALS.MAJOR_1D
  ];
  
  const results = {};
  
  for (const interval of intervals) {
    const klines = await data.getKlines(config.SYMBOL, interval, 100);
    results[interval] = klines;
  }
  
  return results;
}

// 判断大势趋势
function analyzeMajorTrend(timeframes) {
  const trends = {
    [config.INTERVALS.MAJOR_1H]: indicators.getTrendDirection(timeframes[config.INTERVALS.MAJOR_1H]),
    [config.INTERVALS.MAJOR_4H]: indicators.getTrendDirection(timeframes[config.INTERVALS.MAJOR_4H]),
    [config.INTERVALS.MAJOR_1D]: indicators.getTrendDirection(timeframes[config.INTERVALS.MAJOR_1D])
  };
  
  // 多头：大周期上涨
  const isBullishMajor = (
    trends[config.INTERVALS.MAJOR_1D] === 'uptrend' ||
    trends[config.INTERVALS.MAJOR_4H] === 'uptrend'
  );
  
  // 空头：大周期下跌
  const isBearishMajor = (
    trends[config.INTERVALS.MAJOR_1D] === 'downtrend' ||
    trends[config.INTERVALS.MAJOR_4H] === 'downtrend'
  );
  
  return {
    trends,
    isBullishMajor,
    isBearishMajor,
    majorDirection: isBullishMajor ? 'bullish' : isBearishMajor ? 'bearish' : 'sideways'
  };
}

// 分析入场信号
async function analyzeEntrySignal() {
  const timeframes = await fetchAllTimeframes();
  
  if (!timeframes[config.INTERVALS.ENTRY]) {
    return { valid: false, reason: '数据获取失败' };
  }
  
  const entryKlines = timeframes[config.INTERVALS.ENTRY];
  const confirmKlines = timeframes[config.INTERVALS.CONFIRM];
  const majorTrend = analyzeMajorTrend(timeframes);
  
  // 1. 判断大势
  if (!majorTrend.isBullishMajor && !majorTrend.isBearishMajor) {
    return { 
      valid: false, 
      reason: '大周期震荡，无明确趋势',
      majorTrend 
    };
  }
  
  // 2. 判断15分钟趋势（小势）
  const entryTrend = indicators.getTrendDirection(entryKlines);
  
  // 3. 检测量价背离
  const divergence = indicators.detectVolumePriceDivergence(entryKlines);
  
  // 4. 获取当前价格
  const currentPrice = entryKlines[entryKlines.length - 1].close;
  const volumeRatio = indicators.getVolumeRatio(entryKlines);
  
  // 生成信号
  let signal = null;
  let reason = '';
  
  // 做多信号：大势上涨 + 小势下跌（回调）+ 量价背离
  if (majorTrend.isBullishMajor && 
      entryTrend === 'downtrend' && 
      divergence === 'bullish_divergence') {
    
    signal = 'LONG';
    reason = `大势上涨 + 15分钟回调 + 量价背离 (成交量:${(volumeRatio*100).toFixed(0)}%)`;
  }
  
  // 做空信号：大势下跌 + 小势上涨（反弹）+ 量价背离
  if (majorTrend.isBearishMajor && 
      entryTrend === 'uptrend' && 
      divergence === 'bearish_divergence') {
    
    signal = 'SHORT';
    reason = `大势下跌 + 15分钟反弹 + 量价背离 (成交量:${(volumeRatio*100).toFixed(0)}%)`;
  }
  
  if (!signal) {
    return {
      valid: false,
      reason: reason || '未满足入场条件',
      majorTrend,
      entryTrend,
      divergence,
      volumeRatio,
      currentPrice
    };
  }
  
  // 验证信号（用5分钟线二次确认）
  if (confirmKlines && confirmKlines.length > 0) {
    const confirmTrend = indicators.getTrendDirection(confirmKlines);
    const confirmDivergence = indicators.detectVolumePriceDivergence(confirmKlines);
    
    // 如果5分钟趋势与信号相反，不确认
    if (signal === 'LONG' && confirmTrend === 'downtrend') {
      return { valid: false, reason: '5分钟线未确认', currentPrice };
    }
    if (signal === 'SHORT' && confirmTrend === 'uptrend') {
      return { valid: false, reason: '5分钟线未确认', currentPrice };
    }
  }
  
  return {
    valid: true,
    signal,
    reason,
    currentPrice,
    majorTrend,
    entryTrend,
    divergence,
    volumeRatio,
    timestamp: Date.now()
  };
}

// 获取当前持仓状态
function getPositionInfo(positions) {
  // 从持仓数据中获取当前状态
  if (!positions || positions.length === 0) {
    return { hasPosition: false };
  }
  
  const position = positions[0];
  return {
    hasPosition: position.status === 'open',
    side: position.side,
    entryPrice: position.entryPrice,
    quantity: position.quantity,
    currentProfit: position.currentProfit,
    openTime: position.openTime
  };
}

module.exports = {
  analyzeEntrySignal,
  analyzeMajorTrend,
  fetchAllTimeframes,
  getPositionInfo
};
