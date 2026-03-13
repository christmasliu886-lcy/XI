/**
 * 数据获取模块
 * 支持 OKX API
 */

const OKX_BASE = 'https://www.okx.com/api/v5';

// OKX 周期映射
const OKX_INTERVALS = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D'
};

// 获取K线数据
async function getKlines(symbol, interval, limit = 100) {
  try {
    const instId = symbol; // 'ETH-USDT-SWAP'
    const okxInterval = OKX_INTERVALS[interval] || interval;
    
    const response = await fetch(
      `${OKX_BASE}/market/history-candles?instId=${instId}&bar=${okxInterval}&limit=${limit}`
    );
    const data = await response.json();
    
    if (data.code !== '0') {
      console.error('OKX API 错误:', data.msg);
      return null;
    }
    
    // OKX 返回格式: [timestamp, open, high, low, close, volume, ...]
    return data.data.map(k => ({
      time: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: parseInt(k[0]) + 60000
    })).reverse(); // OKX返回的是最新的在最后面，需要反转
  } catch (error) {
    console.error(`获取K线失败: ${error.message}`);
    return null;
  }
}

// 获取当前价格 (从OKX)
async function getCurrentPrice(symbol) {
  try {
    const response = await fetch(
      `${OKX_BASE}/market/ticker?instId=${symbol}`
    );
    const data = await response.json();
    
    if (data.code === '0') {
      return parseFloat(data.data[0].last);
    }
    return null;
  } catch (error) {
    console.error(`获取价格失败: ${error.message}`);
    return null;
  }
}

// 获取现货价格 (兼容 Binance)
async function getSpotPrice(symbol) {
  // 转换成现货格式 ETH-USDT -> ETH/USDT
  const spotSymbol = symbol.replace('-SWAP', '').replace('-', '/');
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${spotSymbol}`);
    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    // 尝试用 OKX
    return getCurrentPrice(symbol);
  }
}

// 获取合约价格 (从OKX)
async function getFuturesPrice(symbol) {
  return getCurrentPrice(symbol);
}

// 获取24小时统计数据
async function get24hrStats(symbol) {
  try {
    const response = await fetch(`${OKX_BASE}/market/ticker?instId=${symbol}`);
    const data = await response.json();
    
    if (data.code === '0') {
      const t = data.data[0];
      return {
        lastPrice: t.last,
        high24h: t.high24h,
        low24h: t.low24h,
        volume24h: t.vol24h
      };
    }
    return null;
  } catch (error) {
    console.error(`获取24小时统计失败: ${error.message}`);
    return null;
  }
}

// 获取合约账户信息
async function getFuturesAccount() {
  // 需要带 API Key 的私有请求，暂时返回 null
  return null;
}

module.exports = {
  getSpotPrice,
  getFuturesPrice,
  getKlines,
  get24hrStats,
  getFuturesAccount,
  getCurrentPrice
};
