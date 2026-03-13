/**
 * ETH 合约自动交易系统 v1.0
 * 配置文件
 */

// 交易品种 (OKX 格式)
exports.SYMBOL = 'ETH-USDT-SWAP';  // OKX 合约交易对
exports.BASE_ASSET = 'ETH';
exports.QUOTE_ASSET = 'USDT';

// 杠杆设置
exports.LEVERAGE = 10;  // 10倍杠杆

// 风险管理
exports.MAX_SINGLE_LOSS = 0.02;  // 单次最大亏损 2%
exports.MAX_DAILY_LOSS = 0.10;  // 单日最大亏损 10%
exports.MAX_RISK_EXPOSURE = 0.20;  // 最大风险敞口 20%

// 止盈规则
exports.TAKE_PROFIT_STAGES = [
  { profit: 0.05, action: 'move_stop_to_break_even' },   // 盈利5%：止损移到成本价
  { profit: 0.10, action: 'close_one_third' },           // 盈利10%：平1/3
  { profit: 0.20, action: 'close_one_third' },           // 盈利20%：再平1/3
  { profit: null, action: 'trailing_stop' }              // 剩余：移动止盈
];

// 移动止盈设置
exports.TRAILING_STOP_PCT = 0.05;  // 从高点回撤5%
exports.MA_PERIOD = 30;  // MA30

// 成交量设置
exports.VOLUME_AVG_PERIOD = 7;  // 7日均量
exports.VOLUME_THRESHOLD = 0.50;  // 萎缩阈值 50%

// K线周期
exports.INTERVALS = {
  ENTRY: '15m',      // 入场参考周期
  CONFIRM: '5m',    // 确认周期
  MAJOR_1H: '1h',   // 大周期1
  MAJOR_4H: '4h',   // 大周期4
  MAJOR_1D: '1d'    // 大周期日
};

// 检查间隔 (毫秒)
exports.CHECK_INTERVAL = 60000;  // 每分钟检查一次

// 通知设置
exports.TELEGRAM = {
  token: '8735180834:AAEFJSOuT7O3nCC_H5WnWDoSDz-UlBWgxJk',
  chatId: '7315773508'
};

// 数据存储
exports.DATA_FILE = './data/trades.json';
exports.STATS_FILE = './data/stats.json';
