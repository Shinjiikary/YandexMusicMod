const fs = require('fs');
const path = require('path');
const os = require('os');

const baseModDir = path.join(process.env.LOCALAPPDATA || path.join(__dirname, '..'), 'YandexMusicMod');
if (!fs.existsSync(baseModDir)) {
  fs.mkdirSync(baseModDir, { recursive: true });
}

const logFilePath = path.join(baseModDir, 'nebula-debug.log');
const MAX_LOG_BYTES = 1024 * 1024; // 1 МБ максимум
const KEEP_LOG_BYTES = 512 * 1024; // Оставляем последние 512 КБ при ротации

// Фильтр штатного мусора Яндекса, который не нужно писать в лог
const NOISE_PATTERNS = [
  /ResizeObserver loop/i,
  /mc\.yandex/i,
  /yandex\.ru\/clck/i,
  /strm\.yandex/i,
  /an\.yandex/i,
  /Script error\.?$/i,
  /Non-Error promise rejection/i,
  /AbortError/i,
  /The play\(\) request was interrupted/i,
  /Failed to fetch.*(?:metrika|clck|telemetry|log|banners)/i
];

const recentMessages = new Map();
const DEDUPE_WINDOW_MS = 15000;

function isNoise(text) {
  if (!text) return true;
  return NOISE_PATTERNS.some((re) => re.test(text));
}

function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(logFilePath)) {
      const stat = fs.statSync(logFilePath);
      if (stat.size > MAX_LOG_BYTES) {
        const buf = fs.readFileSync(logFilePath);
        const sliced = buf.subarray(buf.length - KEEP_LOG_BYTES);
        fs.writeFileSync(logFilePath, '--- [LOG ROTATED] ---\r\n' + sliced.toString('utf-8'), 'utf-8');
      }
    }
  } catch (e) {}
}

function writeLog(level, tag, message, extra = null) {
  try {
    const msgStr = String(message || '').trim();
    const extraStr = extra
      ? typeof extra === 'object'
        ? JSON.stringify(extra)
        : String(extra)
      : '';

    const combined = `${tag}: ${msgStr} ${extraStr}`.trim();
    if (level !== 'SESSION' && isNoise(combined)) return;

    const now = Date.now();
    const dedupeKey = `${level}|${tag}|${msgStr}`;
    const lastTime = recentMessages.get(dedupeKey) || 0;
    if (now - lastTime < DEDUPE_WINDOW_MS && level !== 'SESSION') {
      return;
    }
    recentMessages.set(dedupeKey, now);

    rotateLogIfNeeded();

    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = `[${ts}] [${level}] [${tag}] ${msgStr}${extraStr ? ' | ' + extraStr : ''}\r\n`;
    fs.appendFileSync(logFilePath, line, 'utf-8');
  } catch (e) {}
}

function logSessionStart(extraInfo = {}) {
  const sysInfo = {
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    ramGb: Math.round(os.totalmem() / (1024 ** 3)),
    ...extraInfo
  };
  writeLog('SESSION', 'STARTUP', '=== Запуск Nebula Player ===', sysInfo);
}

module.exports = {
  logFilePath,
  writeLog,
  logSessionStart
};
