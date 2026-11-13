const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const { logFilePath, writeLog, logSessionStart } = require('./logger.js');

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('disable-features', 'PostQuantumKyber,TLS13KeyUpdate');
app.commandLine.appendSwitch('log-level', '3');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const configPath = path.join(app.getPath('userData'), 'nebula-wp-config.json');
const baseModDir = path.join(process.env.LOCALAPPDATA || path.join(__dirname, '..'), 'YandexMusicMod');
const customWallpapersDir = path.join(baseModDir, 'wallpapers');
const censorDir = path.join(baseModDir, 'censor');
const audioCacheDir = path.join(censorDir, 'audio');
const localListPath = path.join(censorDir, 'list_v2.json');
const bundledListPath = path.join(__dirname, 'default_list_v2.json');
if (!fs.existsSync(localListPath) && fs.existsSync(bundledListPath)) {
  try { fs.copyFileSync(bundledListPath, localListPath); } catch (e) {}
}
const coversMapPath = path.join(censorDir, 'covers-map.json');

for (const dir of [customWallpapersDir, censorDir, audioCacheDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Глобальный перехват крашей главного процесса
process.on('uncaughtException', (err) => {
  writeLog('CRITICAL', 'MAIN_CRASH', err.message, err.stack || '');
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? `${reason.message} | ${reason.stack}` : String(reason);
  writeLog('ERROR', 'MAIN_UNHANDLED_REJECTION', msg);
});

const LIST_MIRRORS = [
  'https://fastly.jsdelivr.net/gh/Hazzz895/FckCensorData@main/list_v2.json',
  'https://gcore.jsdelivr.net/gh/Hazzz895/FckCensorData@main/list_v2.json',
  'https://cdn.jsdelivr.net/gh/Hazzz895/FckCensorData@main/list_v2.json',
  'https://raw.githack.com/Hazzz895/FckCensorData/main/list_v2.json',
  'https://raw.githubusercontent.com/Hazzz895/FckCensorData/main/list_v2.json'
];

function buildMirrorCandidates(rawUrl) {
  const urls = [];
  if (!rawUrl) return urls;
  const full = rawUrl.includes('://') ? rawUrl : 'https://' + rawUrl;

  const ghMatch = full.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (ghMatch) {
    const [, user, repo, branch, filePath] = ghMatch;
    const cleanBranch = branch.replace(/^refs\/heads\//i, '');
    urls.push(`https://fastly.jsdelivr.net/gh/${user}/${repo}@${cleanBranch}/${filePath}`);
    urls.push(`https://gcore.jsdelivr.net/gh/${user}/${repo}@${cleanBranch}/${filePath}`);
    urls.push(`https://cdn.jsdelivr.net/gh/${user}/${repo}@${cleanBranch}/${filePath}`);
    urls.push(`https://raw.githack.com/${user}/${repo}/${cleanBranch}/${filePath}`);
  }
  urls.push(full);
  return urls;
}

function downloadUrlBuffer(urlStr) {
  return new Promise((resolve, reject) => {
    const client = urlStr.startsWith('http://') ? http : https;
    const req = client.get(
      urlStr,
      {
        timeout: 12000,
        rejectUnauthorized: false,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, urlStr).href;
          res.resume();
          return downloadUrlBuffer(nextUrl).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function downloadViaCurl(urlStr, destFile) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl.exe',
      ['-k', '-L', '--fail', '--connect-timeout', '8', '--max-time', '25', '-A', 'Mozilla/5.0', urlStr, '-o', destFile],
      (err) => {
        if (!err && fs.existsSync(destFile) && fs.statSync(destFile).size > 512) {
          resolve(fs.readFileSync(destFile));
        } else {
          reject(err || new Error('curl download failed'));
        }
      }
    );
  });
}

async function downloadWithMirrors(rawUrl, contextTag = 'NET_FETCH') {
  const candidates = Array.isArray(rawUrl) ? rawUrl : buildMirrorCandidates(rawUrl);
  const errors = [];

  for (const candidate of candidates) {
    try {
      const buf = await downloadUrlBuffer(candidate);
      if (buf && buf.length > 64) return buf;
    } catch (e) {
      errors.push(`${candidate} (${e.message})`);
      try {
        const tmpFile = path.join(censorDir, `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);
        const buf = await downloadViaCurl(candidate, tmpFile);
        try { fs.unlinkSync(tmpFile); } catch {}
        if (buf && buf.length > 64) return buf;
      } catch (curlErr) {
        errors.push(`curl:${candidate} (${curlErr.message})`);
      }
    }
  }

  writeLog('ERROR', 'API_DEAD', `Все зеркала недоступны [${contextTag}]`, errors.join(' ; '));
  throw new Error(`All mirrors failed for ${contextTag}`);
}

async function ensureCensorDatabase(forceUpdate = false) {
  if (!forceUpdate && fs.existsSync(localListPath)) {
    try {
      const stat = fs.statSync(localListPath);
      if (stat.size > 1000) return true;
    } catch (e) {}
  }
  try {
    const buf = await downloadWithMirrors(LIST_MIRRORS, 'FckCensor_list_v2.json');
    const txt = buf.toString('utf-8');
    JSON.parse(txt);
    fs.writeFileSync(localListPath, txt, 'utf-8');
    writeLog('INFO', 'DB_SYNC', `База list_v2.json успешно обновлена (${buf.length} байт)`);
    return true;
  } catch (e) {
    writeLog('ERROR', 'DB_SYNC_FAIL', 'Не удалось скачать базу list_v2.json', e.message);
    return fs.existsSync(localListPath);
  }
}

let localAudioServerPort = 0;
const remoteTrackUrlMap = new Map();

function startLocalAudioServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      try {
        const parsed = new URL(req.url, 'http://127.0.0.1');
        const match = parsed.pathname.match(/^\/track\/([0-9A-Za-z_-]+)\.mp3$/);
        if (!match) {
          res.writeHead(404);
          return res.end('Not found');
        }

        const trackId = match[1];
        const cachedFile = path.join(audioCacheDir, `${trackId}.mp3`);
        let audioBuffer = null;

        if (fs.existsSync(cachedFile) && fs.statSync(cachedFile).size > 1024) {
          audioBuffer = fs.readFileSync(cachedFile);
        } else {
          const remoteUrl = parsed.searchParams.get('src') || remoteTrackUrlMap.get(trackId);
          if (!remoteUrl) {
            writeLog('WARN', 'AUDIO_NO_SRC', `Не найден URL источника для трека ID ${trackId}`);
            res.writeHead(404);
            return res.end('No remote source');
          }
          audioBuffer = await downloadWithMirrors(remoteUrl, `Track_${trackId}`);
          if (audioBuffer && audioBuffer.length > 1024) {
            try {
              fs.writeFileSync(cachedFile, audioBuffer);
            } catch (e) {}
          }
        }

        if (!audioBuffer || audioBuffer.length <= 1024) {
          writeLog('ERROR', 'AUDIO_EMPTY', `Получен пустой или битый буфер для трека ID ${trackId}`);
          res.writeHead(500);
          return res.end('Empty audio');
        }

        const total = audioBuffer.length;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10) || 0;
          const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
          const chunk = audioBuffer.subarray(start, end + 1);

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length,
            'Content-Type': 'audio/mpeg'
          });
          return res.end(chunk);
        } else {
          res.writeHead(200, {
            'Accept-Ranges': 'bytes',
            'Content-Length': total,
            'Content-Type': 'audio/mpeg'
          });
          return res.end(audioBuffer);
        }
      } catch (err) {
        writeLog('ERROR', 'AUDIO_STREAM_FAIL', `Ошибка раздачи аудио (${req.url})`, err.message);
        res.writeHead(502);
        res.end('Audio fetch error');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      localAudioServerPort = server.address().port;
      resolve(localAudioServerPort);
    });
  });
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    writeLog('ERROR', 'CONFIG_READ_ERR', 'Повреждён файл конфига nebula-wp-config.json', e.message);
  }
  return {};
}

function saveConfig(data) {
  try {
    const current = loadConfig();
    const updated = { ...current, ...data };
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (e) {
    writeLog('ERROR', 'CONFIG_WRITE_ERR', 'Не удалось сохранить конфиг', e.message);
  }
}

function findWorkshopDirs() {
  const candidates = new Set([
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'C:\\Steam',
    'D:\\Steam',
    'D:\\SteamLibrary',
    'E:\\Steam',
    'E:\\SteamLibrary',
    'F:\\SteamLibrary'
  ]);

  for (const base of Array.from(candidates)) {
    const vdfPath = path.join(base, 'steamapps', 'libraryfolders.vdf');
    if (fs.existsSync(vdfPath)) {
      try {
        const content = fs.readFileSync(vdfPath, 'utf-8');
        const matches = content.matchAll(/"path"\s+"([^"]+)"/g);
        for (const m of matches) {
          candidates.add(m[1].replace(/\\\\/g, '\\'));
        }
      } catch (e) {}
    }
  }

  const workshopDirs = [];
  for (const lib of candidates) {
    const weDir = path.join(lib, 'steamapps', 'workshop', 'content', '431960');
    if (fs.existsSync(weDir)) workshopDirs.push(weDir);
  }
  return workshopDirs;
}

function scanAllWallpapers() {
  const items = [];
  let weCount = 0;
  let customCount = 0;

  const weDirs = findWorkshopDirs();
  for (const weDir of weDirs) {
    try {
      const folders = fs.readdirSync(weDir, { withFileTypes: true });
      for (const dir of folders) {
        if (!dir.isDirectory()) continue;
        const itemPath = path.join(weDir, dir.name);
        const projFile = path.join(itemPath, 'project.json');

        let title = `Wallpaper ${dir.name}`;
        let videoFile = null;
        let previewFile = null;

        if (fs.existsSync(projFile)) {
          try {
            const proj = JSON.parse(fs.readFileSync(projFile, 'utf-8'));
            if (proj.title) title = proj.title;
            if (proj.file) {
              const candidate = path.join(itemPath, proj.file);
              if (fs.existsSync(candidate) && /\.(mp4|webm)$/i.test(proj.file)) {
                videoFile = candidate;
              }
            }
            if (proj.preview) {
              const pCandidate = path.join(itemPath, proj.preview);
              if (fs.existsSync(pCandidate)) previewFile = pCandidate;
            }
          } catch (e) {}
        }

        if (!videoFile) {
          const files = fs.readdirSync(itemPath);
          const foundVid = files.find((f) => /\.(mp4|webm)$/i.test(f));
          if (foundVid) videoFile = path.join(itemPath, foundVid);
          if (!previewFile) {
            const foundPrev = files.find((f) => /^preview\.(jpg|jpeg|gif|png|webp)$/i.test(f));
            if (foundPrev) previewFile = path.join(itemPath, foundPrev);
          }
        }

        if (videoFile) {
          weCount++;
          items.push({
            id: `we_${dir.name}`,
            title,
            source: 'we',
            videoUrl: pathToFileURL(videoFile).href,
            previewUrl: previewFile ? pathToFileURL(previewFile).href : null
          });
        }
      }
    } catch (e) {}
  }

  if (fs.existsSync(customWallpapersDir)) {
    try {
      const files = fs.readdirSync(customWallpapersDir);
      for (const f of files) {
        if (/\.(mp4|webm)$/i.test(f)) {
          customCount++;
          const fullPath = path.join(customWallpapersDir, f);
          items.push({
            id: `custom_${f}`,
            title: path.parse(f).name,
            source: 'custom',
            videoUrl: pathToFileURL(fullPath).href,
            previewUrl: null
          });
        }
      }
    } catch (e) {}
  }

  return { weCount, customCount, items };
}

let mainWindow;

async function createWindow() {
  await startLocalAudioServer();
  const dbReady = await ensureCensorDatabase(false);
  logSessionStart({ audioPort: localAudioServerPort, dbReady });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    delete headers['Content-Security-Policy'];
    callback({ cancel: false, responseHeaders: headers });
  });

  const iconCandidate = path.join(__dirname, 'src/assets/ym/favicon.ico');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#000000',
    icon: fs.existsSync(iconCandidate) ? iconCandidate : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  });

  // Логирование падений окна рендера и ошибок загрузки самой Яндекс Музыки
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    writeLog('CRITICAL', 'RENDERER_GONE', `Процесс рендера упал: ${details.reason}`, { exitCode: details.exitCode });
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      writeLog('ERROR', 'PAGE_LOAD_FAIL', `Не загрузилась страница ${validatedURL}: ${errorDescription} (${errorCode})`);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('yandex.') || url.includes('oauth')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 480,
          height: 680,
          autoHideMenuBar: true
        }
      };
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL('https://music.yandex.ru/');
}

app.setAppUserModelId('com.nebula.yandexmusic');
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('window:minimize', () => mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow.close());

ipcMain.on('censor:getInitSync', (event) => {
  event.returnValue = {
    port: localAudioServerPort,
    censorDir,
    audioCacheDir,
    localListPath,
    logFilePath
  };
});

ipcMain.on('censor:registerTracks', (event, entries) => {
  if (Array.isArray(entries)) {
    for (const [id, url] of entries) {
      remoteTrackUrlMap.set(String(id), String(url));
    }
  }
});

ipcMain.on('logger:write', (event, { level, tag, message, extra }) => {
  writeLog(level || 'ERROR', tag || 'RENDERER', message, extra);
});

ipcMain.handle('logger:openFile', async () => {
  if (fs.existsSync(logFilePath)) {
    shell.showItemInFolder(logFilePath);
    return true;
  }
  return false;
});

ipcMain.handle('censor:syncDatabase', async () => {
  return await ensureCensorDatabase(true);
});

ipcMain.handle('censor:openAudioFolder', () => shell.openPath(audioCacheDir));
ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:set', (e, data) => saveConfig(data));
ipcMain.handle('wallpaper:scan', () => scanAllWallpapers());
ipcMain.handle('wallpaper:openFolder', () => shell.openPath(customWallpapersDir));

let coversMapCache = {};
try {
  if (fs.existsSync(coversMapPath)) {
    coversMapCache = JSON.parse(fs.readFileSync(coversMapPath, 'utf-8')) || {};
  }
} catch (e) {}

ipcMain.handle('censor:resolveCover', async (event, { key, query }) => {
  if (!key || !query) return null;
  if (coversMapCache[key]) return coversMapCache[key];

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album,song&limit=5`;
    const buf = await downloadWithMirrors(url, `CoverSearch_${key}`);
    const json = JSON.parse(buf.toString('utf-8'));
    const hit = Array.isArray(json?.results) ? json.results.find((r) => r.artworkUrl100) : null;
    if (hit && hit.artworkUrl100) {
      const pct = '%' + '%';
      const tpl = hit.artworkUrl100
        .replace(/^https?:\/\//i, '')
        .replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${pct}bb.$1`);
      coversMapCache[key] = tpl;
      try {
        fs.writeFileSync(coversMapPath, JSON.stringify(coversMapCache, null, 2), 'utf-8');
      } catch (e) {}
      return tpl;
    }
  } catch (e) {
    writeLog('WARN', 'COVER_RESOLVE_FAIL', `Не удалось получить обложку для "${query}" (${key})`, e.message);
  }
  return null;
});


