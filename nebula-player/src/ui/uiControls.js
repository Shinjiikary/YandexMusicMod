// 1. Инжектим оригинальный sprite.svg для мгновенной работы всех иконок Яндекса
fetch('../assets/ym/icons/sprite.svg')
  .then(r => r.text())
  .then(svg => { document.getElementById('svgSpriteContainer').innerHTML = svg; })
  .catch(err => console.error('Sprite error:', err));

// 2. Кнопки окна
document.getElementById('minBtn').addEventListener('click', () => window.nebulaAPI.minimize());
document.getElementById('maxBtn').addEventListener('click', () => window.nebulaAPI.maximize());
document.getElementById('closeBtn').addEventListener('click', () => window.nebulaAPI.close());

// 3. НАВИГАЦИЯ ПО ВКЛАДКАМ (Моя волна / Тренды / Концерты / Книги / Коллекция / Настройки)
const navButtons = document.querySelectorAll('[data-nav]');
const pages = document.querySelectorAll('.ym-page');
const bottomPlayerBar = document.getElementById('bottomPlayerBar');
const profilePopup = document.getElementById('profilePopup');

function switchPage(pageId) {
  pages.forEach(p => p.classList.toggle('active', p.id === `page-${pageId}`));
  document.querySelectorAll('.ym-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === pageId);
  });
  // На экране «Моя волна» плеер в центре под сферой, а на остальных вкладках всплывает нижний бар (как в 5.126.1)
  if (pageId === 'vibe') {
    bottomPlayerBar.classList.add('hidden');
  } else {
    bottomPlayerBar.classList.remove('hidden');
  }
  profilePopup.classList.add('hidden');
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.nav));
});

// Профиль попап
document.getElementById('profileBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  profilePopup.classList.toggle('hidden');
});
document.getElementById('closePopupBtn').addEventListener('click', () => profilePopup.classList.add('hidden'));

// 4. ЖИВЫЕ ОБОИ (РАБОТАЮТ СРАЗУ: ВИДЕО, ФОТО, GIF, DRAG & DROP)
const bgVideo = document.getElementById('bgVideo');
const bgImage = document.getElementById('bgImage');
const wallpaperInput = document.getElementById('wallpaperInput');
const opacitySlider = document.getElementById('opacitySlider');
const brightnessSlider = document.getElementById('brightnessSlider');

function applyWallpaperFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);

  if (file.type.startsWith('video/')) {
    bgImage.classList.add('hidden');
    bgVideo.classList.remove('hidden');
    bgVideo.src = url;
    bgVideo.play();
  } else if (file.type.startsWith('image/')) {
    bgVideo.classList.add('hidden');
    bgImage.classList.remove('hidden');
    bgImage.style.backgroundImage = `url("${url}")`;
  }

  // Если прозрачность была выкручена в 100%, автоматически делаем панели стеклянными, чтобы обои было видно сразу
  if (Number(opacitySlider.value) > 75) {
    opacitySlider.value = 55;
    document.documentElement.style.setProperty('--panel-opacity', '0.55');
    window.nebulaAPI.setConfig({ hudOpacity: 55 });
  }
}

document.getElementById('quickWallpaperBtn').addEventListener('click', () => wallpaperInput.click());
document.getElementById('popupWallpaperBtn').addEventListener('click', () => {
  profilePopup.classList.add('hidden');
  wallpaperInput.click();
});
document.getElementById('settingsChooseWallpaperBtn').addEventListener('click', () => wallpaperInput.click());

wallpaperInput.addEventListener('change', (e) => {
  if (e.target.files[0]) applyWallpaperFile(e.target.files[0]);
});

// Перетаскивание любого видео или картинки прямо в окно плеера
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files[0]) applyWallpaperFile(e.dataTransfer.files[0]);
});

// Пресеты обоев в настройках
document.querySelectorAll('.nws-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nws-preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const preset = btn.dataset.preset;
    bgImage.classList.add('hidden');
    if (preset === 'default-vibe') {
      bgVideo.classList.remove('hidden');
      bgVideo.src = '../assets/ym/media/vibe_animation_fallback/vibe_animation_fallback_dark.mp4';
      bgVideo.play();
    } else if (preset === 'splash-dark') {
      bgVideo.classList.remove('hidden');
      bgVideo.src = '../assets/ym/media/splash_screen/splash_screen_dark.webm';
      bgVideo.play();
    } else {
      bgVideo.classList.add('hidden');
    }
  });
});

opacitySlider.addEventListener('input', (e) => {
  const val = (e.target.value / 100).toFixed(2);
  document.documentElement.style.setProperty('--panel-opacity', val);
  window.nebulaAPI.setConfig({ hudOpacity: Number(e.target.value) });
});

brightnessSlider.addEventListener('input', (e) => {
  const val = (e.target.value / 100).toFixed(2);
  document.documentElement.style.setProperty('--wallpaper-brightness', val);
});

document.getElementById('toggleGlassBtn').addEventListener('click', () => {
  const current = Number(opacitySlider.value);
  const next = current > 60 ? 35 : 75;
  opacitySlider.value = next;
  document.documentElement.style.setProperty('--panel-opacity', (next / 100).toFixed(2));
  profilePopup.classList.add('hidden');
});

// Переключение скинов плеера (Стандартный / Уточка / Машинка)
document.querySelectorAll('.ym-skin-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.ym-skin-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
  });
});

// 5. АУДИОДВИЖОК И МОЯ ВОЛНА
const loginBtn = document.getElementById('loginBtn');
const vibeCenterPlayer = document.getElementById('vibeCenterPlayer');
const vibeSmallCover = document.getElementById('vibeSmallCover');
const vibePillArtist = document.getElementById('vibePillArtist');
const vibePillTitle = document.getElementById('vibePillTitle');
const vibePillFill = document.getElementById('vibePillFill');
const vibeSeekInput = document.getElementById('vibeSeekInput');
const vibePlayBtn = document.getElementById('vibePlayBtn');
const vibePlayUse = document.getElementById('vibePlayUse');
const vibePrevBtn = document.getElementById('vibePrevBtn');
const vibeNextBtn = document.getElementById('vibeNextBtn');
const vibeLikeBtn = document.getElementById('vibeLikeBtn');
const vibeLikeUse = document.getElementById('vibeLikeUse');
const vibeMainHeading = document.getElementById('vibeMainHeading');

const coverImg = document.getElementById('coverImg');
const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const playBtn = document.getElementById('playBtn');
const playIconUse = document.getElementById('playIconUse');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const likeBtn = document.getElementById('likeBtn');
const likeIconUse = document.getElementById('likeIconUse');
const seekBar = document.getElementById('seekBar');
const bpProgressBg = document.getElementById('bpProgressBg');
const volBar = document.getElementById('volBar');
const curTimeEl = document.getElementById('curTime');
const durTimeEl = document.getElementById('durTime');

const collectionTracksGrid = document.getElementById('collectionTracksGrid');
const searchTracksGrid = document.getElementById('searchTracksGrid');

let token = null;
let queue = [];
let currentIndex = 0;
let isLiked = false;

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function syncPlayIcons(isPlaying) {
  const icon = isPlaying ? '#pause_filled_m' : '#play_filled_m';
  playIconUse.setAttribute('href', icon);
  vibePlayUse.setAttribute('href', icon);
}

function renderTrackLists() {
  const html = queue.map((t, idx) => `
    <div class="coll-track-row" data-idx="${idx}">
      <img src="${t.cover || '../assets/ym/media/vibeCover.c55d574d.png'}" alt="">
      <div class="ctr-meta">
        <div class="ctr-title" style="${idx === currentIndex ? 'color:var(--ym-yellow)' : ''}">${t.title}</div>
        <div class="ctr-artist">${t.artist}</div>
      </div>
      <div class="ctr-dur">${formatTime(t.duration)}</div>
    </div>
  `).join('');

  collectionTracksGrid.innerHTML = html;
  searchTracksGrid.innerHTML = html;

  document.querySelectorAll('.coll-track-row').forEach(row => {
    row.addEventListener('click', () => {
      currentIndex = Number(row.dataset.idx);
      loadAndPlay(currentIndex);
    });
  });
}

async function startWave() {
  loginBtn.classList.add('hidden');
  vibeCenterPlayer.classList.remove('hidden');
  try {
    queue = await window.nebulaAPI.getWave(token);
    currentIndex = 0;
    renderTrackLists();
    await loadAndPlay(currentIndex);
  } catch (err) {
    console.error('Ошибка волны:', err);
  }
}

async function loadAndPlay(index) {
  if (!queue.length) return;
  const track = queue[index];

  trackTitle.textContent = track.title;
  trackArtist.textContent = track.artist;
  vibePillTitle.textContent = track.title;
  vibePillArtist.textContent = track.artist;

  const cover = track.cover || '../assets/ym/media/vibeCover.c55d574d.png';
  coverImg.src = cover;
  vibeSmallCover.src = cover;

  renderTrackLists();

  try {
    const streamUrl = await window.nebulaAPI.getTrackUrl(token, track.id);
    if (window.visualEngine) window.visualEngine.connectAudio(window.audioCore.audio);
    await window.audioCore.playUrl(streamUrl);
    syncPlayIcons(true);
  } catch (err) {
    console.error('Ошибка потока:', err);
  }
}

function togglePlay() {
  const isPlaying = window.audioCore.toggle();
  syncPlayIcons(isPlaying);
}

playBtn.addEventListener('click', togglePlay);
vibePlayBtn.addEventListener('click', togglePlay);

async function playNext() {
  currentIndex++;
  if (currentIndex >= queue.length) {
    queue = await window.nebulaAPI.getWave(token);
    currentIndex = 0;
  }
  loadAndPlay(currentIndex);
}

function playPrev() {
  if (currentIndex > 0) {
    currentIndex--;
    loadAndPlay(currentIndex);
  }
}

nextBtn.addEventListener('click', playNext);
vibeNextBtn.addEventListener('click', playNext);
prevBtn.addEventListener('click', playPrev);
vibePrevBtn.addEventListener('click', playPrev);

// Клик по быстрым тегам волны слева и настройкам настроения
document.querySelectorAll('[data-vibe], [data-vibe-mood]').forEach(el => {
  el.addEventListener('click', () => {
    const label = el.dataset.vibe || el.dataset.vibeMood;
    vibeMainHeading.textContent = label || 'Моя волна';
    switchPage('vibe');
    playNext();
  });
});

document.getElementById('reshuffleWaveBtn').addEventListener('click', () => startWave());
document.getElementById('playCollectionWaveBtn').addEventListener('click', () => {
  switchPage('vibe');
  togglePlay();
});

function toggleLike() {
  isLiked = !isLiked;
  likeBtn.classList.toggle('liked', isLiked);
  vibeLikeBtn.classList.toggle('liked', isLiked);
  const href = isLiked ? '#liked_xs' : '#like_xs';
  likeIconUse.setAttribute('href', href);
  vibeLikeUse.setAttribute('href', href);
}

likeBtn.addEventListener('click', toggleLike);
vibeLikeBtn.addEventListener('click', toggleLike);

// Перемотка и громкость
function handleSeek(val) {
  window.audioCore.seek(val);
  vibePillFill.style.width = `${val}%`;
  bpProgressBg.style.width = `${val}%`;
}

seekBar.addEventListener('input', (e) => handleSeek(e.target.value));
vibeSeekInput.addEventListener('input', (e) => handleSeek(e.target.value));

volBar.addEventListener('input', (e) => {
  window.audioCore.setVolume(e.target.value / 100);
  window.nebulaAPI.setConfig({ volume: Number(e.target.value) });
});

window.audioCore.onTimeUpdate((progress, current, duration) => {
  seekBar.value = progress;
  vibeSeekInput.value = progress;
  vibePillFill.style.width = `${progress}%`;
  bpProgressBg.style.width = `${progress}%`;
  curTimeEl.textContent = formatTime(current);
  durTimeEl.textContent = formatTime(duration);
});

window.audioCore.onEnded(() => playNext());

// Авторизация
async function triggerLogin() {
  const newToken = await window.nebulaAPI.login();
  if (newToken) {
    token = newToken;
    startWave();
  }
}

loginBtn.addEventListener('click', triggerLogin);
document.getElementById('reloginBtn').addEventListener('click', triggerLogin);

// Старт и чтение конфига
(async function init() {
  const cfg = await window.nebulaAPI.getConfig();
  if (cfg.volume !== undefined) {
    volBar.value = cfg.volume;
    window.audioCore.setVolume(cfg.volume / 100);
  }
  if (cfg.hudOpacity !== undefined) {
    opacitySlider.value = cfg.hudOpacity;
    document.documentElement.style.setProperty('--panel-opacity', (cfg.hudOpacity / 100).toFixed(2));
  }
  if (cfg.ym_token) {
    token = cfg.ym_token;
    startWave();
  } else {
    loginBtn.classList.remove('hidden');
    vibeCenterPlayer.classList.add('hidden');
  }
})();