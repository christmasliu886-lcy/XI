/**
 * OKX API 交易模块
 */

const https = require('https');
const crypto = require('crypto');

// OKX API 配置
const config = {
  apiKey: '6ae4c9ac-d0c6-4ad0-9b96-79eaca2250a8',
  secret: '48C19C7BD8ED00E80C6418B659EC7BCD',
  passphrase: 'LCYlv587.',
  baseUrl: 'https://www.okx.com',
  simulation: false  // 模拟盘真实下单
};

// 生成签名
function generateSignature(timestamp, method, requestPath, body = '') {
  const message = timestamp + method + requestPath + body;
  const mac = crypto.createHmac('sha256', config.secret);
  const signature = mac.update(message).digest('base64');
  return signature;
}

// 发送 API 请求
function request(method, requestPath, body = {}) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString();
    const bodyStr = Object.keys(body).length > 0 ? JSON.stringify(body) : '';
    const signature = generateSignature(timestamp, method, requestPath, bodyStr);
    
    const options = {
      hostname: 'www.okx.com',
      port: 443,
      path: requestPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': config.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': config.passphrase,
        'x-simulated-trading': '1'  // 模拟盘标识
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    
    if (bodyStr) {
      req.write(bodyStr);
    }
    
    req.end();
  });
}

// 获取账户余额
async function getBalance() {
  try {
    const response = await request('GET', '/api/v5/account/balance');
    if (response.code === '0') {
      const data = response.data[0];
      const usdt = data.details.find(d => d.ccy === 'USDT');
      return usdt ? parseFloat(usdt.availBal) : 0;
    }
    return 0;
  } catch (error) {
    console.error('获取余额失败:', error.message);
    return 0;
  }
}

// 设置杠杆
async function setLeverage(symbol, leverage, side = 'long') {
  try {
    const response = await request('POST', '/api/v5/account/set-leverage', {
      instId: symbol,
      lever: leverage,
      mgnMode: 'isolated',
      posSide: side
    });
    return response.code === '0';
  } catch (error) {
    console.error('设置杠杆失败:', error.message);
    return false;
  }
}

// 开仓
async function openPosition(symbol, side, quantity, price, leverage = 10) {
  console.log(`\n📝 尝试开仓: ${side} ${quantity} ${symbol} @ ${price}`);
  
  if (config.simulation) {
    console.log('⚠️ 模拟模式，不真实下单');
    return {
      success: true,
      simulation: true,
      orderId: 'sim-' + Date.now(),
      side,
      quantity,
      price
    };
  }
  
  try {
    // 先设置杠杆
    const levResult = await setLeverage(symbol, leverage, side);
    console.log('设置杠杆结果:', levResult);
    
    // OKX合约sz参数是合约张数，1张=0.01ETH
    // quantity是ETH数量，转换成张数：quantity / 0.01 = quantity * 100
    const contractSize = 100; // 1张 = 0.01 ETH
    const contractQty = Math.floor(quantity * contractSize);
    
    const orderSide = side === 'long' ? 'buy' : 'sell';
    const orderBody = {
      instId: symbol,
      tdMode: 'isolated',
      side: orderSide,
      posSide: side,
      ordType: 'market',
      sz: contractQty.toString()
    };
    console.log('下单参数:', JSON.stringify(orderBody));
    
    const response = await request('POST', '/api/v5/trade/order', orderBody);
    console.log('下单响应:', JSON.stringify(response));
    
    if (response.code === '0') {
      console.log('✅ 开仓成功:', response.data[0].ordId);
      return { success: true, orderId: response.data[0].ordId };
    } else {
      console.error('❌ 开仓失败:', response.msg);
      return { success: false, error: response.msg };
    }
  } catch (error) {
    console.error('开仓错误:', error.message);
    return { success: false, error: error.message };
  }
}

// 平仓
async function closePosition(symbol, side, quantity, price) {
  console.log(`\n📝 尝试平仓: ${side} ${quantity} ${symbol} @ ${price}`);
  
  if (config.simulation) {
    console.log('⚠️ 模拟模式，不真实下单');
    return {
      success: true,
      simulation: true,
      orderId: 'sim-close-' + Date.now(),
      side,
      quantity,
      price
    };
  }
  
  try {
    const closeSide = side === 'long' ? 'sell' : 'buy';
    // 转换ETH为合约张数
    const contractSize = 100;
    const contractQty = Math.floor(quantity * contractSize);
    
    const response = await request('POST', '/api/v5/trade/order', {
      instId: symbol,
      tdMode: 'isolated',
      side: closeSide,
      posSide: side === 'long' ? 'long' : 'short',
      ordType: 'market',
      sz: contractQty.toString()
    });
    
    if (response.code === '0') {
      console.log('✅ 平仓成功:', response.data[0].ordId);
      return { success: true, orderId: response.data[0].ordId };
    } else {
      console.error('❌ 平仓失败:', response.msg);
      return { success: false, error: response.msg };
    }
  } catch (error) {
    console.error('平仓错误:', error.message);
    return { success: false, error: error.message };
  }
}

// 获取当前持仓
async function getPositions() {
  try {
    const response = await request('GET', '/api/v5/account/positions?instId=ETH-USDT-SWAP');
    if (response.code === '0' && response.data.length > 0) {
      return response.data.filter(p => parseFloat(p.pos) > 0);
    }
    return [];
  } catch (error) {
    console.error('获取持仓失败:', error.message);
    return [];
  }
}

// 获取当前价格
async function getCurrentPrice(instId = 'ETH-USDT-SWAP') {
  try {
    const response = await request('GET', `/api/v5/market/ticker?instId=${instId}`);
    if (response.code === '0') {
      return parseFloat(response.data[0].last);
    }
    return null;
  } catch (error) {
    console.error('获取价格失败:', error.message);
    return null;
  }
}

module.exports = {
  config,
  getBalance,
  openPosition,
  closePosition,
  getPositions,
  getCurrentPrice,
  setLeverage
};
