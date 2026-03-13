/**
 * 交易执行模块
 * 开仓、平仓、止盈、止损逻辑
 */

const config = require('./config');

// 计算仓位大小 (以损定仓)
function calculatePositionSize(accountBalance, entryPrice, stopLossPrice) {
  const riskAmount = accountBalance * config.MAX_SINGLE_LOSS;
  const priceDiff = Math.abs(entryPrice - stopLossPrice);
  
  // 合约数量 = 风险金额 / 价格差
  let quantity = riskAmount / priceDiff;
  
  // 考虑杠杆
  const leveragedQuantity = quantity * config.LEVERAGE;
  
  // 保留4位小数
  return Math.floor(leveragedQuantity * 10000) / 10000;
}

// 检查是否可以开仓
function canOpenPosition(dailyPL, positionCount) {
  // 检查单日亏损限制
  if (dailyPL <= -config.MAX_DAILY_LOSS) {
    return { allowed: false, reason: '已达单日最大亏损限额' };
  }
  
  // 检查风险敞口
  // 这里暂时不限制，简化处理
  
  return { allowed: true };
}

// 计算止损价格
function calculateStopLoss(entryPrice, side, atr = null) {
  // 默认止损 2%
  const defaultPct = 0.02;
  const defaultStopLoss = entryPrice * defaultPct;
  
  if (side === 'LONG') {
    return entryPrice - defaultStopLoss;
  } else {
    return entryPrice + defaultStopLoss;
  }
}

// 检查止盈条件
function checkTakeProfit(entryPrice, currentPrice, side, totalProfit) {
  const profitPct = side === 'LONG' 
    ? (currentPrice - entryPrice) / entryPrice
    : (entryPrice - currentPrice) / entryPrice;
  
  for (const stage of config.TAKE_PROFIT_STAGES) {
    if (stage.action === 'move_stop_to_break_even' && profitPct >= stage.profit) {
      return { triggered: true, action: stage.action, profitPct };
    }
    if (stage.action === 'close_one_third' && profitPct >= stage.profit) {
      return { triggered: true, action: stage.action, profitPct };
    }
  }
  
  // 移动止盈检查
  const lastStage = config.TAKE_PROFIT_STAGES[config.TAKE_PROFIT_STAGES.length - 1];
  if (profitPct >= 0.20) {  // 盈利超过20%
    return { triggered: true, action: lastStage.action, profitPct };
  }
  
  return { triggered: false, profitPct };
}

// 计算移动止损价格
function calculateTrailingStop(highestPrice, lowestPrice, side, entryPrice) {
  if (side === 'LONG') {
    const stopPrice = highestPrice * (1 - config.TRAILING_STOP_PCT);
    // 确保不低于成本价
    return Math.max(stopPrice, entryPrice);
  } else {
    const stopPrice = lowestPrice * (1 + config.TRAILING_STOP_PCT);
    // 确保不高于成本价
    return Math.min(stopPrice, entryPrice);
  }
}

// 模拟开仓 (实际需要 Binance API)
function simulateOpenPosition(signal, price, quantity) {
  const position = {
    id: Date.now().toString(),
    symbol: config.SYMBOL,
    side: signal === 'LONG' ? 'LONG' : 'SHORT',
    entryPrice: price,
    quantity: quantity,
    leverage: config.LEVERAGE,
    openTime: Date.now(),
    status: 'open',
    
    // 止盈止损
    stopLoss: calculateStopLoss(price, signal === 'LONG' ? 'LONG' : 'SHORT'),
    takeProfit: null,  // 移动止盈
    
    // 跟踪
    highestPrice: price,
    lowestPrice: price,
    currentProfit: 0,
    profitPct: 0,
    
    // 分批平仓记录
    closedQuantity: 0,
    stages: {
      stopMoved: false,
      firstBatch: false,
      secondBatch: false,
      finalClose: false
    }
  };
  
  return position;
}

// 更新持仓状态
function updatePosition(position, currentPrice) {
  if (!position || position.status !== 'open') return position;
  
  // 更新最高/最低价
  if (position.side === 'LONG') {
    if (currentPrice > position.highestPrice) {
      position.highestPrice = currentPrice;
    }
  } else {
    if (currentPrice < position.lowestPrice) {
      position.lowestPrice = currentPrice;
    }
  }
  
  // 计算当前盈亏
  if (position.side === 'LONG') {
    position.currentProfit = (currentPrice - position.entryPrice) * position.quantity;
    position.profitPct = (currentPrice - position.entryPrice) / position.entryPrice;
  } else {
    position.currentProfit = (position.entryPrice - currentPrice) * position.quantity;
    position.profitPct = (position.entryPrice - currentPrice) / position.entryPrice;
  }
  
  // 检查止损
  let stopTriggered = false;
  if (position.side === 'LONG' && currentPrice <= position.stopLoss) {
    stopTriggered = true;
  } else if (position.side === 'SHORT' && currentPrice >= position.stopLoss) {
    stopTriggered = true;
  }
  
  if (stopTriggered) {
    position.status = 'closed';
    position.closePrice = position.stopLoss;
    position.closeTime = Date.now();
    position.closeReason = 'stop_loss';
    return position;
  }
  
  // 检查止盈阶段
  const profitPct = position.profitPct;
  
  // 阶段1: 盈利5%，移动止损到成本价
  if (profitPct >= 0.05 && !position.stages.stopMoved) {
    position.stopLoss = position.entryPrice;
    position.stages.stopMoved = true;
  }
  
  // 阶段2: 盈利10%，平1/3
  if (profitPct >= 0.10 && !position.stages.firstBatch) {
    position.closedQuantity += position.quantity / 3;
    position.stages.firstBatch = true;
    position.closePrice = currentPrice;
    position.closeTime = Date.now();
    position.closeReason = 'take_profit_1';
  }
  
  // 阶段3: 盈利20%，再平1/3
  if (profitPct >= 0.20 && !position.stages.secondBatch) {
    position.closedQuantity += position.quantity / 3;
    position.stages.secondBatch = true;
    position.closePrice = currentPrice;
    position.closeTime = Date.now();
    position.closeReason = 'take_profit_2';
  }
  
  // 阶段4: 剩余仓位，跌破MA30或回撤5%平仓
  if (profitPct >= 0.20 && position.closedQuantity < position.quantity) {
    const trailingStop = position.side === 'LONG'
      ? position.highestPrice * (1 - config.TRAILING_STOP_PCT)
      : position.lowestPrice * (1 + config.TRAILING_STOP_PCT);
    
    const shouldClose = position.side === 'LONG' 
      ? currentPrice <= trailingStop
      : currentPrice >= trailingStop;
    
    if (shouldClose) {
      position.closedQuantity = position.quantity;
      position.status = 'closed';
      position.closePrice = currentPrice;
      position.closeTime = Date.now();
      position.closeReason = 'trailing_stop';
    }
  }
  
  return position;
}

module.exports = {
  calculatePositionSize,
  canOpenPosition,
  calculateStopLoss,
  checkTakeProfit,
  calculateTrailingStop,
  simulateOpenPosition,
  updatePosition
};
