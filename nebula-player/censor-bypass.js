const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

(function initStandaloneFckCensor() {
  if (location.hostname.includes('passport.yandex') || location.hostname.includes('oauth.yandex')) {
    return;
  }

  function sendBugLog(level, tag, message, extra = null) {
    try {
      ipcRenderer.send('logger:write', { level, tag, message, extra });
    } catch (e) {}
  }

  // Перехват глобальных JS-крашей и ошибок загрузки видео/аудио в рендере
  window.addEventListener(
    'error',
    (e) => {
      const target = e.target;
      if (target && (target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) {
        const src = target.currentSrc || target.src || '';
        if (!src) return;
        const errCode = target.error ? target.error.code : 'unknown';
        if (target.id === 'ym-wp-video') {
          sendBugLog('ERROR', 'WALLPAPER_LOAD_FAIL', `Не загрузились видео-обои: ${src}`, { code: errCode });
        } else if (src.includes('127.0.0.1') || target.tagName === 'AUDIO') {
          sendBugLog('ERROR', 'AUDIO_ELEMENT_ERR', `Сбой воспроизведения медиапотока: ${src}`, { code: errCode });
        }
        return;
      }
      if (e.message) {
        sendBugLog('ERROR', 'RENDERER_JS_ERR', e.message, {
          file: e.filename ? e.filename.split('/').pop() : '',
          line: e.lineno
        });
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const msg = reason instanceof Error ? `${reason.message}` : String(reason || '');
    if (msg) {
      sendBugLog('ERROR', 'UNHANDLED_PROMISE', msg);
    }
  });

  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'seekable');
    if (desc && desc.get) {
      Object.defineProperty(HTMLMediaElement.prototype, 'seekable', {
        ...desc,
        get: function () {
          const r = desc.get.call(this);
          if (r && typeof r.start === 'function') {
            try {
              Object.defineProperty(r, 'start', {
                value: r.start.bind(r),
                configurable: true,
                writable: true
              });
            } catch (e) {}
          }
          return r;
        }
      });
    }
  } catch (e) {}

  const initData = ipcRenderer.sendSync('censor:getInitSync');
  const { port: audioPort, censorDir, audioCacheDir, localListPath } = initData;
  const settingsPath = path.join(censorDir, 'censor-settings.json');
  const coversMapPath = path.join(censorDir, 'covers-map.json');
  const DISCLAIMER_CENSOR_ID = '65256e7f0ec8594f3459e3fa';
  const pct2 = '%' + '%';

  let cfg = { enabled: true, spoofMeta: true };
  try {
    if (fs.existsSync(settingsPath)) {
      cfg = { ...cfg, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) };
    }
  } catch (e) {}

  let localCoversMap = {};
  try {
    if (fs.existsSync(coversMapPath)) {
      localCoversMap = JSON.parse(fs.readFileSync(coversMapPath, 'utf-8')) || {};
    }
  } catch (e) {}

  function saveCfg(patch) {
    Object.assign(cfg, patch);
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (e) {}
    updateStatusUI();
  }

  const trackSpoofs = new Map();
  const albumSpoofs = new Map();
  const artistSpoofs = new Map();
  const remoteAudioUrls = new Map();
  const localAudioIds = new Set();

  let currentPlayingTrackId = null;
  let currentlyUncensoredTrackId = null;

  const cleanTrackId = (id) => String(id ?? '').split(':')[0].trim();

  function ensureHttps(url) {
    if (typeof url !== 'string' || !url) return '';
    if (url.includes('://')) return url;
    return 'https://' + url;
  }

  function normalizeCoverUri(uri) {
    if (typeof uri !== 'string' || !uri) return uri;
    return uri.replace(/^https?:\/\//i, '');
  }

  function isValidYandexOrItunesCover(uri) {
    if (typeof uri !== 'string' || !uri) return false;
    return uri.includes('avatars.') || uri.includes('mzstatic.com');
  }

  function applyCoverToTarget(target, rawUri) {
    if (!target || typeof target !== 'object' || !rawUri) return;
    const clean = normalizeCoverUri(rawUri);
    target.coverUri = clean;
    target.ogImage = clean;
    target.cover = {
      ...(target.cover && typeof target.cover === 'object' ? target.cover : {}),
      type: 'from-album-cover',
      uri: clean,
      prefix: 'fck'
    };
    delete target.cover.error;
  }

  function scanLocalAudioFolder() {
    localAudioIds.clear();
    try {
      const files = fs.readdirSync(audioCacheDir);
      for (const f of files) {
        if (/\.(mp3|flac|wav|ogg|m4a)$/i.test(f)) {
          const full = path.join(audioCacheDir, f);
          if (fs.statSync(full).size > 1024) {
            localAudioIds.add(path.parse(f).name.trim());
          }
        }
      }
    } catch (e) {}
  }

  function parseDatabaseJson(raw) {
    if (!raw || !Array.isArray(raw.sources)) return false;

    trackSpoofs.clear();
    albumSpoofs.clear();
    artistSpoofs.clear();
    remoteAudioUrls.clear();

    for (const src of raw.sources) {
      if (src.tracks && typeof src.tracks === 'object') {
        for (const [id, data] of Object.entries(src.tracks)) {
          const cid = cleanTrackId(id);
          if (!trackSpoofs.has(cid)) trackSpoofs.set(cid, { ...data });
        }
      }
      if (src.albums && typeof src.albums === 'object') {
        for (const [id, data] of Object.entries(src.albums)) {
          const cid = cleanTrackId(id);
          if (!albumSpoofs.has(cid)) albumSpoofs.set(cid, { ...data });
        }
      }
      if (src.artists && typeof src.artists === 'object') {
        for (const [id, data] of Object.entries(src.artists)) {
          const cid = cleanTrackId(id);
          if (!artistSpoofs.has(cid)) artistSpoofs.set(cid, { ...data });
        }
      }

      if (Array.isArray(src.tracksStorages)) {
        for (const st of src.tracksStorages) {
          const resolveTpl = (val) => {
            if ((typeof val === 'number' || (typeof val === 'string' && !val.includes('://'))) && st.urlTemplate) {
              return st.urlTemplate.split(pct2).join(String(val));
            }
            return val;
          };

          if (Array.isArray(st.trackIds)) {
            for (const item of st.trackIds) {
              const id = cleanTrackId(typeof item === 'number' ? item : item.id);
              const dur = typeof item === 'number' ? undefined : item.durationMs;
              if (dur !== undefined) {
                const prev = trackSpoofs.get(id) || {};
                trackSpoofs.set(id, { ...prev, durationMs: dur });
              }
              if (st.urlTemplate && !remoteAudioUrls.has(id)) {
                remoteAudioUrls.set(id, ensureHttps(st.urlTemplate.split(pct2).join(id)));
              }
            }
          }

          if (st.tracks && typeof st.tracks === 'object') {
            for (const [rawId, val] of Object.entries(st.tracks)) {
              const id = cleanTrackId(rawId);
              let url, dur;
              if (typeof val === 'object' && val !== null) {
                url = resolveTpl(val.url !== undefined ? val.url : id);
                dur = val.durationMs;
              } else {
                url = resolveTpl(val);
              }
              if (url && !remoteAudioUrls.has(id)) {
                remoteAudioUrls.set(id, ensureHttps(String(url)));
              }
              if (typeof dur === 'number') {
                const prev = trackSpoofs.get(id) || {};
                trackSpoofs.set(id, { ...prev, durationMs: dur });
              }
            }
          }
        }
      }
    }

    for (const alb of albumSpoofs.values()) {
      if (Array.isArray(alb.volumes) && isValidYandexOrItunesCover(alb.coverUri)) {
        alb.volumes.flat().forEach((t) => {
          const tid = cleanTrackId(t?.id ?? t);
          const tr = trackSpoofs.get(tid);
          if (tr && !tr.coverUri) tr.coverUri = alb.coverUri;
        });
      }
    }

    ipcRenderer.send('censor:registerTracks', Array.from(remoteAudioUrls.entries()));
    updateStatusUI();
    return true;
  }

  function loadLocalDatabaseSync() {
    scanLocalAudioFolder();
    if (fs.existsSync(localListPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(localListPath, 'utf-8'));
        const ok = parseDatabaseJson(raw);
        if (!ok) sendBugLog('ERROR', 'DB_PARSE_EMPTY', 'list_v2.json не содержит валидного массива sources');
        return ok;
      } catch (e) {
        sendBugLog('ERROR', 'DB_PARSE_ERR', 'Ошибка чтения или парсинга list_v2.json', e.message);
      }
    } else {
      sendBugLog('WARN', 'DB_MISSING', 'Файл list_v2.json отсутствует на старте');
    }
    return false;
  }

  function hasAudioReplacement(trackId) {
    const id = cleanTrackId(trackId);
    return Boolean(id) && (localAudioIds.has(id) || remoteAudioUrls.has(id));
  }

  function buildLocalStreamUrl(trackId) {
    const id = cleanTrackId(trackId);
    const remote = remoteAudioUrls.get(id) || '';
    return `http://127.0.0.1:${audioPort}/track/${id}.mp3?src=${encodeURIComponent(remote)}`;
  }

  window.pulsesyncApi = window.pulsesyncApi || {};
  window.pulsesyncApi.getTrackReplacement = function (trackId) {
    if (!cfg.enabled) return null;
    const cid = cleanTrackId(trackId);
    if (hasAudioReplacement(cid)) {
      return buildLocalStreamUrl(cid);
    }
    return null;
  };

  async function resolveMissingCoverAsync(key, artistName, titleName) {
    if (!key) return null;
    if (localCoversMap[key]) return localCoversMap[key];
    const q = `${artistName || ''} ${titleName || ''}`.replace(/\(.*?\)/g, '').trim();
    if (!q) return null;
    try {
      const tpl = await ipcRenderer.invoke('censor:resolveCover', { key, query: q });
      if (tpl) {
        localCoversMap[key] = tpl;
        return tpl;
      }
    } catch (e) {}
    return null;
  }

  function spoofArtistObject(artist) {
    if (!artist || typeof artist !== 'object' || artist.id === undefined) return;
    const sp = artistSpoofs.get(cleanTrackId(artist.id));
    if (!sp) return;
    if (sp.name) artist.name = sp.name;
    if (isValidYandexOrItunesCover(sp.coverUri)) {
      const cleanUri = normalizeCoverUri(sp.coverUri);
      artist.coverUri = cleanUri;
      artist.ogImage = cleanUri;
    }
    artist.available = true;
  }

  async function spoofAlbumObjectAsync(album) {
    if (!album || typeof album !== 'object' || album.id === undefined) return;
    const aid = cleanTrackId(album.id);
    const sp = albumSpoofs.get(aid);

    if (sp) {
      if (sp.title) album.title = sp.title;
      if ('version' in sp) album.version = sp.version;
      if (sp.year !== undefined) album.year = sp.year;
      if (isValidYandexOrItunesCover(sp.coverUri)) {
        applyCoverToTarget(album, sp.coverUri);
      }
      album.available = true;
      album.availableForPremiumUsers = true;
    }

    if (!album.coverUri && album.title) {
      const artistName = Array.isArray(album.artists) && album.artists[0]?.name ? album.artists[0].name : '';
      const resolved = await resolveMissingCoverAsync(`album:${aid}`, artistName, album.title);
      if (resolved) {
        applyCoverToTarget(album, resolved);
      }
    }

    if (Array.isArray(album.artists)) album.artists.forEach(spoofArtistObject);
    if (Array.isArray(album.volumes)) {
      for (const vol of album.volumes) {
        if (Array.isArray(vol)) {
          for (const tr of vol) {
            if (album.coverUri && tr && !tr.coverUri) {
              applyCoverToTarget(tr, album.coverUri);
            }
            await spoofTrackObjectAsync(tr);
          }
        }
      }
    }
  }

  function applyTrackFields(target, sp, hasAudio) {
    if (!target || typeof target !== 'object') return;
    if (hasAudio || sp) {
      target.available = true;
      target.isAvailable = true;
      target.availableForPremiumUsers = true;
      target.availableFullWithoutPermission = true;
      delete target.error;
      if (Array.isArray(target.disclaimers)) {
        target.disclaimers = target.disclaimers.filter((d) => !String(d).includes(DISCLAIMER_CENSOR_ID));
      }
    }
    if (sp) {
      if (sp.title) target.title = sp.title;
      if (sp.name) target.name = sp.name;
      if ('version' in sp) target.version = sp.version;
      if (typeof sp.durationMs === 'number') target.durationMs = sp.durationMs;
      if (isValidYandexOrItunesCover(sp.coverUri)) {
        applyCoverToTarget(target, sp.coverUri);
      }
      if ((!Array.isArray(target.artists) || target.artists.length === 0) && Array.isArray(sp.artists) && sp.artists.length > 0) {
        target.artists = sp.artists.map((a) => ({
          id: Number(a.id) || a.id,
          name: String(a.name || 'Без имени'),
          various: Boolean(a.various),
          composer: false,
          available: true
        }));
      }
    }
  }

  async function spoofTrackObjectAsync(track) {
    if (!track || typeof track !== 'object' || track.id === undefined) return;
    const id = cleanTrackId(track.id);
    const sp = trackSpoofs.get(id);
    const hasAudio = hasAudioReplacement(id);

    applyTrackFields(track, sp, hasAudio);
    if (track.substituted && typeof track.substituted === 'object') {
      applyTrackFields(track.substituted, sp, hasAudio);
    }

    if (Array.isArray(track.artists)) track.artists.forEach(spoofArtistObject);

    if (Array.isArray(track.albums)) {
      for (const alb of track.albums) {
        await spoofAlbumObjectAsync(alb);
        if (!track.coverUri && alb?.coverUri) {
          applyCoverToTarget(track, alb.coverUri);
          if (track.substituted && typeof track.substituted === 'object') {
            applyCoverToTarget(track.substituted, alb.coverUri);
          }
        }
      }
    }

    if (!track.coverUri && (hasAudio || sp) && track.title) {
      const artistName = Array.isArray(track.artists) && track.artists[0]?.name ? track.artists[0].name : '';
      const resolved = await resolveMissingCoverAsync(`track:${id}`, artistName, track.title);
      if (resolved) {
        applyCoverToTarget(track, resolved);
        if (track.substituted && typeof track.substituted === 'object') {
          applyCoverToTarget(track.substituted, resolved);
        }
        if (Array.isArray(track.albums) && track.albums[0]) {
          applyCoverToTarget(track.albums[0], resolved);
        }
      }
    }
  }

  async function walkAndSpoofJsonAsync(node, visited = new WeakSet(), depth = 0) {
    if (!node || typeof node !== 'object' || depth > 12 || visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        await walkAndSpoofJsonAsync(node[i], visited, depth + 1);
      }
      return;
    }

    if (node.id !== undefined) {
      if ('durationMs' in node || 'storageDir' in node || 'trackSource' in node || 'realId' in node) {
        await spoofTrackObjectAsync(node);
      } else if ('volumes' in node || 'trackCount' in node) {
        await spoofAlbumObjectAsync(node);
      } else if ('name' in node && ('counts' in node || 'various' in node || 'composer' in node)) {
        spoofArtistObject(node);
      }
    }

    for (const key of Object.keys(node)) {
      const val = node[key];
      if (val && typeof val === 'object') {
        await walkAndSpoofJsonAsync(val, visited, depth + 1);
      }
    }
  }

  function makeDownloadInfoItem(rawTrackId, origItem = null) {
    const cid = cleanTrackId(rawTrackId);
    const streamUrl = buildLocalStreamUrl(cid);
    const isCached = localAudioIds.has(cid);
    const sp = trackSpoofs.get(cid);
    const label = sp?.title ? `«${sp.title}»` : `ID ${cid}`;

    currentlyUncensoredTrackId = cid;
    currentPlayingTrackId = cid;
    showMiniToast(`🔓 Без цензуры ${isCached ? '(Кэш ПК)' : '(Подмена)'}: ${label}`);
    setTimeout(scanLocalAudioFolder, 5000);

    const dl = {
      ...(origItem || {}),
      trackId: String(rawTrackId),
      realId: String(cid),
      quality: origItem?.quality || 'normal',
      codec: 'mp3',
      bitrate: 320,
      transport: 'raw',
      gain: false,
      url: streamUrl,
      urls: [streamUrl],
      pulseSyncReplacement: true
    };
    delete dl.key;
    delete dl.sign;
    delete dl.size;
    delete dl.error;
    return dl;
  }

  function buildSingleFileInfoResponse(rawTrackId, originalData = null) {
    const origDl = originalData?.result?.downloadInfo || originalData?.downloadInfo || originalData?.fileInfo || null;
    const dl = makeDownloadInfoItem(rawTrackId, origDl);

    return {
      invocationInfo: originalData?.invocationInfo || {
        'req-id': 'fckcensor-local',
        hostname: 'nebula-local',
        'exec-duration-millis': 1
      },
      downloadInfo: dl,
      fileInfo: dl,
      result: {
        ...(originalData?.result || {}),
        downloadInfo: dl,
        fileInfo: dl
      }
    };
  }

  const origFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : (input && input.url) || String(input);

    if (!cfg.enabled || !urlStr.includes('api.music.yandex.')) {
      return origFetch(input, init);
    }

    if (urlStr.includes('/get-file-info/batch')) {
      try {
        const parsedUrl = new URL(urlStr, location.origin);
        const rawIds = (parsedUrl.searchParams.get('trackIds') || parsedUrl.searchParams.get('track-ids') || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        const replacedHits = rawIds.filter((id) => hasAudioReplacement(id));

        if (replacedHits.length > 0) {
          let origJson = null;
          try {
            const resp = await origFetch(input, init);
            if (resp.ok) origJson = await resp.json();
          } catch (e) {}

          const origList =
            origJson?.result?.downloadInfos ||
            origJson?.result?.fileInfos ||
            origJson?.downloadInfos ||
            origJson?.fileInfos ||
            [];

          const finalInfos = rawIds
            .map((id) => {
              const existing = origList.find((x) => cleanTrackId(x?.trackId) === cleanTrackId(id));
              if (hasAudioReplacement(id)) {
                return makeDownloadInfoItem(existing?.trackId ?? id, existing);
              }
              return existing;
            })
            .filter(Boolean);

          const batchPayload = {
            invocationInfo: origJson?.invocationInfo || { 'req-id': 'fckcensor-batch' },
            downloadInfos: finalInfos,
            fileInfos: finalInfos,
            result: {
              ...(origJson?.result || {}),
              downloadInfos: finalInfos,
              fileInfos: finalInfos
            }
          };

          return new Response(JSON.stringify(batchPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        }
      } catch (e) {
        sendBugLog('ERROR', 'BATCH_HOOK_ERR', 'Ошибка в перехватчике /get-file-info/batch', e.message);
      }
    }

    if (urlStr.includes('/get-file-info') && !urlStr.includes('/get-file-info/batch')) {
      try {
        const parsedUrl = new URL(urlStr, location.origin);
        const rawTrackId =
          parsedUrl.searchParams.get('trackId') ||
          parsedUrl.searchParams.get('track-id') ||
          '';
        const cid = cleanTrackId(rawTrackId);
        if (cid) currentPlayingTrackId = cid;

        if (cid && hasAudioReplacement(cid)) {
          let origJson = null;
          try {
            const origRes = await origFetch(input, init);
            if (origRes.ok) origJson = await origRes.json();
          } catch (e) {}

          const replacedPayload = buildSingleFileInfoResponse(rawTrackId, origJson);
          return new Response(JSON.stringify(replacedPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        } else {
          currentlyUncensoredTrackId = null;
        }
      } catch (e) {
        sendBugLog('ERROR', 'SINGLE_HOOK_ERR', 'Ошибка в перехватчике /get-file-info', e.message);
      }
    }

    if (cfg.spoofMeta && init && init.headers) {
      try {
        if (init.headers instanceof Headers) init.headers.delete('if-none-match');
        else delete init.headers['if-none-match'];
      } catch (e) {}
    }

    let response;
    try {
      response = await origFetch(input, init);
    } catch (netErr) {
      sendBugLog('ERROR', 'YANDEX_API_NET_ERR', `Сбой сети при запросе к API Яндекса: ${urlStr.split('?')[0]}`, netErr.message);
      throw netErr;
    }

    if (response.status >= 500 || response.status === 401 || response.status === 403 || response.status === 429) {
      sendBugLog('WARN', 'YANDEX_API_HTTP_ERR', `API Яндекса вернул статус ${response.status}: ${urlStr.split('?')[0]}`);
    }

    if (cfg.spoofMeta && response.status === 200) {
      const ct = (response.headers && response.headers.get('content-type')) || '';
      if (ct.includes('application/json')) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          await walkAndSpoofJsonAsync(data);
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Content-Type', 'application/json; charset=utf-8');
          return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          });
        } catch (e) {
          sendBugLog('ERROR', 'JSON_SPOOF_ERR', `Ошибка модификации JSON для ${urlStr.split('?')[0]}`, e.message);
          return response;
        }
      }
    }

    return response;
  };

  const yaspHookTimer = setInterval(() => {
    const yasp = window.Ya && window.Ya.YaspAudioElement;
    if (yasp && typeof yasp.configureSource === 'function' && !yasp.__nebulaHooked) {
      const origConfigure = yasp.configureSource;
      yasp.configureSource = function (src, opts = {}) {
        if (src && String(src).includes(`127.0.0.1:${audioPort}`)) {
          const cleanOpts = { ...opts };
          delete cleanOpts.audioDecodingKey;
          cleanOpts.mirrorUrls = [];
          return origConfigure.call(this, src, cleanOpts);
        }
        return origConfigure.apply(this, arguments);
      };
      yasp.__nebulaHooked = true;
      clearInterval(yaspHookTimer);
    }
  }, 200);

  function showMiniToast(text) {
    let toast = document.getElementById('ym-fck-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ym-fck-toast';
      toast.style.cssText = `
        position: fixed; top: 44px; right: 18px; z-index: 2147483647;
        padding: 8px 14px; border-radius: 12px;
        background: rgba(20, 16, 32, 0.9); backdrop-filter: blur(18px);
        border: 1px solid rgba(192, 132, 252, 0.55);
        box-shadow: 0 10px 30px rgba(0,0,0,0.65);
        color: #fff; font-family: 'YSText', 'Segoe UI', sans-serif;
        font-size: 12px; font-weight: 600; pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
        opacity: 0; transform: translateY(-8px);
      `;
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
    }, 3500);
  }

  function updateStatusUI() {
    const statEl = document.getElementById('fck-stat-line');
    if (statEl) {
      statEl.textContent = `В базе: ${remoteAudioUrls.size} аудио, ${trackSpoofs.size} треков, ${albumSpoofs.size} альб. | Кэш MP3: ${localAudioIds.size}`;
    }
    const toggleBtn = document.getElementById('fck-btn-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = cfg.enabled ? '🛡️ Антицензура: ВКЛ' : '🛡️ Антицензура: ВЫКЛ';
      toggleBtn.style.background = cfg.enabled
        ? 'linear-gradient(135deg, #9333ea, #a855f7)'
        : 'rgba(255,255,255,0.08)';
    }
  }

  function mountControlPanelIntoModal() {
    const modal = document.getElementById('ym-wp-modal');
    if (!modal || document.getElementById('ym-fck-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'ym-fck-panel';
    panel.className = 'wp-section-box hide-on-peek';
    panel.innerHTML = `
      <div class="wp-sec-title">
        <span>🛡️ Антицензура FckCensor (Автономный модуль)</span>
        <span id="fck-stat-line" style="font-size:11px;color:#4ade80">Загрузка базы...</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="wp-act-btn" id="fck-btn-toggle"></button>
        <button class="wp-act-btn" id="fck-btn-sync">🔄 Обновить базу (через зеркало CDN)</button>
        <button class="wp-act-btn" id="fck-btn-folder">📁 Папка кэша MP3</button>
        <button class="wp-act-btn" id="fck-btn-log" title="Показать файл nebula-debug.log в Проводнике">📄 Лог багов</button>
      </div>
    `;

    const header = modal.querySelector('.wp-m-header');
    if (header && header.nextSibling) {
      modal.insertBefore(panel, header.nextSibling);
    } else {
      modal.prepend(panel);
    }

    panel.querySelector('#fck-btn-toggle').addEventListener('click', () => {
      saveCfg({ enabled: !cfg.enabled });
    });
    panel.querySelector('#fck-btn-sync').addEventListener('click', async () => {
      showMiniToast('⏳ Скачиваем свежую базу через CDN-зеркало...');
      const ok = await ipcRenderer.invoke('censor:syncDatabase');
      loadLocalDatabaseSync();
      showMiniToast(
        ok
          ? `🛡️ База обновлена: ${remoteAudioUrls.size} аудио, ${trackSpoofs.size} треков`
          : '⚠️ Ошибка обновления базы'
      );
    });
    panel.querySelector('#fck-btn-folder').addEventListener('click', () => {
      ipcRenderer.invoke('censor:openAudioFolder');
    });
    panel.querySelector('#fck-btn-log').addEventListener('click', () => {
      ipcRenderer.invoke('logger:openFile');
    });

    updateStatusUI();
  }

  loadLocalDatabaseSync();

  setInterval(() => {
    mountControlPanelIntoModal();
  }, 500);
})();
