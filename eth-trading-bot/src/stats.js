/**
 * 统计分析模块
 * 记录和统计交易数据
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

// 确保数据目录存在
function ensureDataDir() {
  const dir = path.dirname(config.DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 加载交易记录
function loadTrades() {
  ensureDataDir();
  try {
    if (fs.existsSync(config.DATA_FILE)) {
      const data = fs.readFileSync(config.DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('加载交易记录失败:', error);
  }
  return [];
}

// 保存交易记录
function saveTrades(trades) {
  ensureDataDir();
  try {
    fs.writeFileSync(config.DATA_FILE, JSON.stringify(trades, null, 2));
  } catch (error) {
    console.error('保存交易记录失败:', error);
  }
}

// 添加交易记录
function addTrade(trade) {
  const trades = loadTrades();
  trades.push(trade);
  saveTrades(trades);
}

// 更新交易记录
function updateTrade(tradeId, updates) {
  const trades = loadTrades();
  const index = trades.findIndex(t => t.id === tradeId);
  if (index !== -1) {
    trades[index] = { ...trades[index], ...updates };
    saveTrades(trades);
  }
}

// 计算统计数据
function calculateStats(trades) {
  if (!trades || trades.length === 0) {
    return getEmptyStats();
  }
  
  const closedTrades = trades.filter(t => t.status === 'closed');
  
  if (closedTrades.length === 0) {
    return getEmptyStats();
  }
  
  // 基础统计
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter(t => t.realizedProfit > 0);
  const losingTrades = closedTrades.filter(t => t.realizedProfit <= 0);
  
  const winCount = winningTrades.length;
  const lossCount = losingTrades.length;
  const winRate = totalTrades > 0 ? winCount / totalTrades : 0;
  
  // 盈亏统计
  const totalProfit = winningTrades.reduce((sum, t) => sum + t.realizedProfit, 0);
  const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.realizedProfit, 0));
  const netProfit = totalProfit - totalLoss;
  
  const avgWin = winCount > 0 ? totalProfit / winCount : 0;
  const avgLoss = lossCount > 0 ? totalLoss / lossCount : 0;
  const profitRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
  
  // 持仓分析
  const profits = closedTrades.map(t => t.profitPct * 100);
  const maxProfit = Math.max(...profits);
  const maxLoss = Math.min(...profits);
  
  // 浮盈浮亏
  const floatingProfits = trades.filter(t => t.status === 'open').map(t => t.profitPct * 100);
  const maxFloatingProfit = floatingProfits.length > 0 ? Math.max(...floatingProfits) : 0;
  const maxFloatingLoss = floatingProfits.length > 0 ? Math.min(...floatingProfits) : 0;
  
  // 持仓时间
  const holdingTimes = closedTrades.map(t => {
    if (t.closeTime && t.openTime) {
      return t.closeTime - t.openTime;
    }
    return 0;
  });
  const avgHoldingTime = holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length;
  
  // 连胜连亏
  let currentStreak = 0;
  let maxWinStreak = 0;
  let maxLoseStreak = 0;
  
  // 按时间排序
  const sortedTrades = [...closedTrades].sort((a, b) => a.closeTime - b.closeTime);
  
  for (const trade of sortedTrades) {
    if (trade.realizedProfit > 0) {
      if (currentStreak > 0) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
      maxWinStreak = Math.max(maxWinStreak, currentStreak);
    } else {
      if (currentStreak < 0) {
        currentStreak--;
      } else {
        currentStreak = -1;
      }
      maxLoseStreak = Math.max(maxLoseStreak, Math.abs(currentStreak));
    }
  }
  
  // 今日统计
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  
  const todayTrades = closedTrades.filter(t => t.closeTime >= todayStart);
  const todayProfit = todayTrades.reduce((sum, t) => sum + t.realizedProfit, 0);
  
  return {
    // 基础统计
    totalTrades,
    winCount,
    lossCount,
    winRate: (winRate * 100).toFixed(2) + '%',
    
    // 盈亏
    totalProfit: totalProfit.toFixed(2),
    totalLoss: totalLoss.toFixed(2),
    netProfit: netProfit.toFixed(2),
    avgWin: avgWin.toFixed(2),
    avgLoss: avgLoss.toFixed(2),
    profitRatio: profitRatio.toFixed(2),
    
    // 持仓分析
    avgHoldingTime: formatHoldingTime(avgHoldingTime),
    maxProfit: maxProfit.toFixed(2) + '%',
    maxLoss: maxLoss.toFixed(2) + '%',
    maxFloatingProfit: maxFloatingProfit.toFixed(2) + '%',
    maxFloatingLoss: maxFloatingLoss.toFixed(2) + '%',
    
    // 连胜连亏
    maxWinStreak,
    maxLoseStreak,
    
    // 今日
    todayTrades,
    todayProfit: todayProfit.toFixed(2)
  };
}

// 获取空统计数据
function getEmptyStats() {
  return {
    totalTrades: 0,
    winCount: 0,
    lossCount: 0,
    winRate: '0%',
    totalProfit: '0',
    totalLoss: '0',
    netProfit: '0',
    avgWin: '0',
    avgLoss: '0',
    profitRatio: '0',
    avgHoldingTime: '0',
    maxProfit: '0%',
    maxLoss: '0%',
    maxFloatingProfit: '0%',
    maxFloatingLoss: '0%',
    maxWinStreak: 0,
    maxLoseStreak: 0,
    todayTrades: 0,
    todayProfit: '0'
  };
}

// 格式化持仓时间
function formatHoldingTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`;
  }
  return `${minutes}分钟`;
}

// 获取统计报告
function getStatsReport() {
  const trades = loadTrades();
  const stats = calculateStats(trades);
  
  let report = `📊 交易统计报告\n\n`;
  report += `基础统计:\n`;
  report += `- 总交易次数: ${stats.totalTrades}\n`;
  report += `- 盈利次数: ${stats.winCount}\n`;
  report += `- 亏损次数: ${stats.lossCount}\n`;
  report += `- 胜率: ${stats.winRate}\n\n`;
  
  report += `盈亏统计:\n`;
  report += `- 总盈利: ${stats.totalProfit}\n`;
  report += `- 总亏损: ${stats.totalLoss}\n`;
  report += `- 净利润: ${stats.netProfit}\n`;
  report += `- 平均盈利: ${stats.avgWin}\n`;
  report += `- 平均亏损: ${stats.avgLoss}\n`;
  report += `- 盈亏比: ${stats.profitRatio}\n\n`;
  
  report += `持仓分析:\n`;
  report += `- 平均持仓时间: ${stats.avgHoldingTime}\n`;
  report += `- 最大单笔盈利: ${stats.maxProfit}\n`;
  report += `- 最大单笔亏损: ${stats.maxLoss}\n`;
  report += `- 最高浮盈: ${stats.maxFloatingProfit}\n`;
  report += `- 最大浮亏: ${stats.maxFloatingLoss}\n\n`;
  
  report += `连胜/连亏:\n`;
  report += `- 最高连胜: ${stats.maxWinStreak}次\n`;
  report += `- 最高连亏: ${stats.maxLoseStreak}次\n\n`;
  
  report += `今日:\n`;
  report += `- 交易次数: ${stats.todayTrades}\n`;
  report += `- 今日盈亏: ${stats.todayProfit}\n`;
  
  return report;
}

module.exports = {
  loadTrades,
  saveTrades,
  addTrade,
  updateTrade,
  calculateStats,
  getStatsReport
};
