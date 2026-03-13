/**
 * 通知模块
 * 通过 Telegram 发送通知
 */

const config = require('./config');

// 发送 Telegram 消息
async function sendTelegramMessage(message) {
  try {
    const { token, chatId } = config.TELEGRAM;
    
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
      console.error('Telegram发送失败:', data.description);
      return false;
    }
    return true;
  } catch (error) {
    console.error('发送通知失败:', error.message);
    return false;
  }
}

// 开仓通知
function notifyOpenPosition(position) {
  const sideEmoji = position.side === 'LONG' ? '🟢' : '🔴';
  const sideText = position.side === 'LONG' ? '做多' : '做空';
  
  const message = `
${sideEmoji} <b>开仓通知</b>

品种: ${position.symbol}
方向: ${sideText}
开仓价: ${position.entryPrice}
数量: ${position.quantity}
杠杆: ${position.leverage}x
止损价: ${position.stopLoss.toFixed(2)}

⏰ ${new Date().toLocaleString()}
  `.trim();
  
  return sendTelegramMessage(message);
}

// 平仓通知
function notifyClosePosition(position, reason) {
  const profitEmoji = position.realizedProfit > 0 ? '✅' : '❌';
  
  const message = `
${profitEmoji} <b>平仓通知</b>

品种: ${position.symbol}
方向: ${position.side}
开仓价: ${position.entryPrice}
平仓价: ${position.closePrice}
平仓原因: ${reason}

盈亏: ${position.realizedProfit.toFixed(2)} USDT
盈亏率: ${(position.profitPct * 100).toFixed(2)}%

⏰ ${new Date().toLocaleString()}
  `.trim();
  
  return sendTelegramMessage(message);
}

// 入场信号通知
function notifyEntrySignal(signal) {
  const sideEmoji = signal.signal === 'LONG' ? '🟢' : '🔴';
  const sideText = signal.signal === 'LONG' ? '做多' : '做空';
  
  const message = `
🚨 <b>入场信号</b>

方向: ${sideText}
价格: ${signal.currentPrice.toLocaleString()}
原因: ${signal.reason}

大势: ${signal.majorTrend.majorDirection}
小势: ${signal.entryTrend}

⏰ ${new Date().toLocaleString()}

系统将自动开仓！
  `.trim();
  
  return sendTelegramMessage(message);
}

// 预警通知
function notifyWarning(message) {
  const fullMessage = `
⚠️ <b>系统预警</b>

${message}

⏰ ${new Date().toLocaleString()}
  `.trim();
  
  return sendTelegramMessage(fullMessage);
}

// 定时报告
function notifyDailyReport(stats) {
  const message = `
📊 <b>每日交易报告</b>

今日交易: ${stats.todayTrades} 次
今日盈亏: ${stats.todayProfit} USDT

胜率: ${stats.winRate}
盈亏比: ${stats.profitRatio}
净利润: ${stats.netProfit} USDT

⏰ ${new Date().toLocaleString()}
  `.trim();
  
  return sendTelegramMessage(message);
}

// 错误通知
function notifyError(error) {
  const message = `
❌ <b>系统错误</b>

${error}

⏰ ${new Date().toLocaleString()}
  `.trim();
  
  return sendTelegramMessage(message);
}

module.exports = {
  sendTelegramMessage,
  notifyOpenPosition,
  notifyClosePosition,
  notifyEntrySignal,
  notifyWarning,
  notifyDailyReport,
  notifyError
};
