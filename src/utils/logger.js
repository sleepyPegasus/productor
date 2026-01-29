/**
 * 日志工具 - 统一的控制台输出格式
 */

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

export const logger = {
  info(msg) {
    console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.blue}INFO${COLORS.reset}  ${msg}`);
  },

  success(msg) {
    console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.green}OK${COLORS.reset}    ${msg}`);
  },

  warn(msg) {
    console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}WARN${COLORS.reset}  ${msg}`);
  },

  error(msg) {
    console.error(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.red}ERROR${COLORS.reset} ${msg}`);
  },

  step(phase, msg) {
    console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.magenta}[${phase}]${COLORS.reset} ${msg}`);
  },

  divider() {
    console.log(`${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}`);
  },

  banner(text) {
    const line = '═'.repeat(text.length + 4);
    console.log(`\n${COLORS.cyan}╔${line}╗`);
    console.log(`║  ${text}  ║`);
    console.log(`╚${line}╝${COLORS.reset}\n`);
  },
};
