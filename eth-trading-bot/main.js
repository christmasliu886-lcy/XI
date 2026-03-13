/**
 * ETH 合约自动交易系统 v1.0
 * 主程序 - 支持 OKX 实盘
 */

const config = require('./src/config');
const data = require('./src/data');
const signals = require('./src/signals');
const trading = require('./src/trading');
const stats = require('./src/stats');
const notifier = require('./src/notifier');
const okx = require('./src/okx');

// 全局状态
let positions = [];  // 当前持仓
let dailyPL = 0;     // 今日盈亏
let lastDailyReset = new Date().setHours(0, 0, 0, 0);  // 上次重置日期
let lastSignalTime = 0;  // 上次信号时间（避免频繁）
let lastReportTime = 0;  // 上次30分钟汇报时间
let last9amReportTime = 0;  // 上次9点汇报时间
let systemStartTime = Date.now();  // 系统启动时间
let lastLoopTime = Date.now();  // 上次循环时间
let lastError = null;  // 上次错误信息
let restartCount = 0;  // 重启次数

// 生成状态报告 (从OKX API获取实时数据)
async function generateStatusReport(currentPrice) {
  const now = new Date();
  const uptime = Math.floor((Date.now() - systemStartTime) / 1000 / 60);
  
  // 从OKX获取真实持仓
  const okxPositions = await okx.getPositions();
  const balance = await okx.getBalance();
  
  let positionInfo = '无';
  let totalPnl = dailyPL;
  
  if (okxPositions.length > 0) {
    for (const p of okxPositions) {
      const contracts = parseFloat(p.pos); // 合约张数
      const qty = contracts * 0.01; // ETH数量
      const avgPx = parseFloat(p.avgPx);
      const upl = parseFloat(p.upl || 0);
      const margin = parseFloat(p.margin || 0);
      const notionalUsd = parseFloat(p.notionalUsd || 0);
      totalPnl += upl;
      const pnlPct = ((currentPrice - avgPx) / avgPx * 100).toFixed(2);
      positionInfo = `${contracts} 张 (${qty.toFixed(2)} ETH) @ $${avgPx.toFixed(0)}\n`;
      positionInfo += `名义价值: $${notionalUsd.toFixed(0)} USDT | 保证金: $${margin.toFixed(0)} | 盈亏: ${upl.toFixed(0)} USDT (${pnlPct}%)`;
    }
  }
  
  let report = `📊 <b>交易系统状态汇报</b>\n\n`;
  report += `⏰ ${now.toLocaleString()}\n\n`;
  report += `<b>运行状态:</b>\n`;
  report += `- 运行时间: ${uptime} 分钟\n`;
  report += `- 重启次数: ${restartCount}\n`;
  if (lastError) {
    report += `- 上次错误: ${lastError}\n`;
  }
  report += `\n<b>当前状态:</b>\n`;
  report += `- 价格: $${currentPrice || 'N/A'}\n`;
  report += `- 持仓: ${positionInfo}\n`;
  report += `- 余额: ${balance.toFixed(2)} USDT\n`;
  report += `- 持仓盈亏: ${totalPnl.toFixed(2)} USDT\n`;
  
  return report;
}

// 发送汇报 - 只在整点或半点发送
async function sendReport(currentPrice, forceNineAm = false) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();
  
  // 只在整点或半点的前10秒内发送（避免重复）
  const isHalfHour = (currentMinute === 0 || currentMinute === 30) && currentSecond < 10;
  const isNineAm = currentHour === 9 && currentMinute < 10 && currentSecond < 10;
  
  // 检查是否需要30分钟汇报（间隔30分钟以上）
  const thirtyMinInterval = 30 * 60 * 1000;
  const shouldHalfHourReport = isHalfHour && (Date.now() - lastReportTime) > thirtyMinInterval;
  
  // 检查是否需要9点汇报
  const shouldNineAmReport = isNineAm && (Date.now() - last9amReportTime) > 24 * 60 * 60 * 1000;
  
  if (shouldHalfHourReport || shouldNineAmReport || forceNineAm) {
    // 如果传入的价格是0，获取当前价格
    let price = currentPrice;
    if (!price || price === 0) {
      price = await okx.getCurrentPrice();
    }
    
    const report = await generateStatusReport(price);
    console.log(report);
    await notifier.sendTelegramMessage(report);
    
    if (shouldHalfHourReport) {
      lastReportTime = Date.now();
      console.log('✅ 已发送状态汇报');
    }
    if (shouldNineAmReport) last9amReportTime = Date.now();
  }
}

// 主循环
async function mainLoop() {
  console.log(`\n[${new Date().toISOString()}] 检查交易信号...`);
  
  try {
    // 1. 获取当前价格 (从 OKX)
    const currentPrice = await data.getCurrentPrice(config.SYMBOL);
    if (!currentPrice) {
      console.log('获取价格失败');
      return;
    }
    console.log(`当前价格: ${currentPrice}`);
    
    // 2. 从OKX获取真实持仓
    const okxPositions = await okx.getPositions();
    console.log(`OKX持仓: ${okxPositions.length}单`);
    
    // 检查是否已有持仓 (优先使用OKX真实持仓)
    let openPositions = positions.filter(p => p.status === 'open');
    
    // 如果OKX有持仓但本地没有，同步过来
    if (okxPositions.length > 0 && openPositions.length === 0) {
      for (const okxPos of okxPositions) {
        // pos是合约张数，1张=0.01ETH
        const qty = (parseFloat(okxPos.pos) || parseFloat(okxPos.availPos) || 0) * 0.01;
        const entryPrice = parseFloat(okxPos.avgOpenPrice) || currentPrice;
        openPositions.push({
          id: okxPos.ordId || okxPos.posId,
          status: 'open',
          side: okxPos.posSide === 'long' ? 'long' : 'short',
          quantity: qty,
          entryPrice: entryPrice,
          currentPrice: currentPrice,
          profit: 0,
          profitPct: 0,
          simulation: false,
          openedAt: Date.now()
        });
        console.log(`同步持仓: ${okxPos.posSide} ${qty} ETH @ ${entryPrice}`);
      }
    }
    
    // 更新本地持仓列表
    positions = openPositions;
    
    if (openPositions.length > 0) {
      // 更新持仓状态
      for (const position of openPositions) {
        trading.updatePosition(position, currentPrice);
        
        // 检查是否需要平仓
        if (position.status === 'closed') {
          const reason = getCloseReason(position.closeReason);
          
          // 尝试平仓 (实盘)
          if (!position.simulation) {
            const closeResult = await okx.closePosition(
              config.SYMBOL,
              position.side,
              position.quantity - position.closedQuantity,
              currentPrice
            );
            console.log('平仓结果:', closeResult);
          }
          
          await notifier.notifyClosePosition(position, reason);
          
          // 更新今日盈亏
          dailyPL += position.realizedProfit;
          
          // 保存交易记录
          stats.addTrade(position);
          
          // 从持仓列表中移除
          positions = positions.filter(p => p.id !== position.id);
        }
      }
      
      console.log(`持仓中... 盈亏: ${(openPositions[0].profitPct * 100).toFixed(2)}%`);
    }
    
    // 3. 检查是否可以开仓
    const canOpen = trading.canOpenPosition(dailyPL, 0);
    if (!canOpen.allowed) {
      console.log(`不能开仓: ${canOpen.reason}`);
      await notifier.notifyWarning(canOpen.reason);
      return;
    }
    
    // 4. 分析入场信号
    const signal = await signals.analyzeEntrySignal();
    
    if (!signal.valid) {
      console.log(`信号无效: ${signal.reason}`);
      return;
    }
    
    // 5. 避免频繁开仓 (5分钟内不重复)
    const now = Date.now();
    if (now - lastSignalTime < 5 * 60 * 1000) {
      console.log('信号太频繁，跳过');
      return;
    }
    
    // 6. 计算仓位
    const accountBalance = await okx.getBalance();
    const effectiveBalance = accountBalance > 0 ? accountBalance : 87675; // 如果获取不到余额，用默认值
    
    console.log(`账户余额: ${effectiveBalance} USDT`);
    
    const stopLossPrice = trading.calculateStopLoss(
      currentPrice, 
      signal.signal === 'LONG' ? 'LONG' : 'SHORT'
    );
    const quantity = trading.calculatePositionSize(
      effectiveBalance,
      currentPrice,
      stopLossPrice
    );
    
    if (quantity <= 0) {
      console.log('计算仓位失败');
      return;
    }
    
    console.log(`\n✅ 检测到入场信号!`);
    console.log(`方向: ${signal.signal}`);
    console.log(`价格: ${currentPrice}`);
    console.log(`数量: ${quantity}`);
    
    // 7. 发送信号通知
    await notifier.notifyEntrySignal(signal);
    
    // 8. 开仓 (实盘)
    const okxSide = signal.signal === 'LONG' ? 'long' : 'short';
    const openResult = await okx.openPosition(
      config.SYMBOL,
      okxSide,
      quantity,
      currentPrice,
      config.LEVERAGE
    );
    
    console.log('开仓结果:', openResult);
    
    // 9. 创建持仓记录
    const position = trading.simulateOpenPosition(
      signal.signal,
      currentPrice,
      quantity
    );
    position.simulation = openResult.simulation; // 标记是否模拟
    position.orderId = openResult.orderId;
    
    positions.push(position);
    lastSignalTime = now;
    
    // 10. 发送开仓通知
    await notifier.notifyOpenPosition(position);
    
    console.log(`✅ 开仓完成! ${openResult.simulation ? '(模拟模式)' : '(实盘)'}`);
    
    // 11. 状态汇报 (每30分钟 + 每天9点)
    await sendReport(currentPrice);
    
  } catch (error) {
    console.error('主循环错误:', error);
    lastError = error.message;
    await notifier.notifyError(error.message);
  }
}

// 获取平仓原因文字
function getCloseReason(reason) {
  const reasons = {
    'stop_loss': '止损',
    'take_profit_1': '止盈(10%)',
    'take_profit_2': '止盈(20%)',
    'trailing_stop': '移动止盈'
  };
  return reasons[reason] || reason;
}

// 检查是否需要重置每日统计
function checkDailyReset() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  
  if (todayStart > lastDailyReset) {
    dailyPL = 0;
    lastDailyReset = todayStart;
    console.log('新的一天，重置每日盈亏');
  }
}

// 启动系统
async function start() {
  console.log('='.repeat(50));
  console.log('🚀 ETH 合约自动交易系统 v1.0 启动');
  console.log('='.repeat(50));
  console.log(`交易品种: ${config.SYMBOL}`);
  console.log(`交易平台: OKX`);
  console.log(`杠杆倍数: ${config.LEVERAGE}x`);
  console.log(`单次止损: ${config.MAX_SINGLE_LOSS * 100}%`);
  console.log(`检查间隔: ${config.CHECK_INTERVAL / 1000}秒`);
  console.log('='.repeat(50));
  
  // 测试连接 OKX
  const balance = await okx.getBalance();
  console.log(`OKX 账户余额: ${balance} USDT`);
  
  await notifier.sendTelegramMessage('🟢 ETH 自动交易系统已启动!\n\n品种: ETH-USDT-SWAP\n平台: OKX\n杠杆: 10x\n单次止损: 2%');
  
  // 立即执行一次
  await mainLoop();
  
  // 定时执行
  setInterval(async () => {
    checkDailyReset();
    await mainLoop();
  }, config.CHECK_INTERVAL);
}

// 启动
start();
