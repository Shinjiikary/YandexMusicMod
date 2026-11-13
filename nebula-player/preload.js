try { require(require('path').join(__dirname, 'censor-bypass.js')); } catch (e) { console.error('[FckCensor]', e); }
const { ipcRenderer } = require('electron');

(async function initYandexLiquidGlassMod() {
  if (location.hostname.includes('passport.yandex') || location.hostname.includes('oauth.yandex')) {
    return;
  }

  const saved = await ipcRenderer.invoke('config:get');

  const state = {
    wallpaperUrl: saved.wallpaperUrl || '',
    wpBrightness: saved.wpBrightness ?? 75,
    wpBlur: saved.wpBlur ?? 0,
    softVibeGlow: saved.softVibeGlow ?? true,
    zenMode: saved.zenMode ?? false,

    glassOpacity: saved.glassOpacity ?? 18,
    glassSpecular: saved.glassSpecular ?? 75,
    glassBlur: saved.glassBlur ?? 22,
    glassPlayBtn: saved.glassPlayBtn ?? false,

    hideNavSearch: saved.hideNavSearch ?? false,
    hideNavTrends: saved.hideNavTrends ?? false,
    hideNavConcerts: saved.hideNavConcerts ?? false,
    hideNavPodcasts: saved.hideNavPodcasts ?? false,
    hideNavCollection: saved.hideNavCollection ?? false,
    hideNavPlus: saved.hideNavPlus ?? true,
    hideNavPins: saved.hideNavPins ?? false,
    hideVibeCarousel: saved.hideVibeCarousel ?? false,

    hidePlayerCover: saved.hidePlayerCover ?? false,
    hideArtistBackdrop: saved.hideArtistBackdrop ?? false,
    hidePlayerTitle: saved.hidePlayerTitle ?? false,
    hidePlayerArtist: saved.hidePlayerArtist ?? false,
    hidePlayerPill: saved.hidePlayerPill ?? false,
    hidePlayerSideBtns: saved.hidePlayerSideBtns ?? false,
    hidePlayerSkipBtns: saved.hidePlayerSkipBtns ?? false,
    hideVibeTitle: saved.hideVibeTitle ?? false,
    hideVibeAiText: saved.hideVibeAiText ?? false
  };

  let currentFilter = 'all';
  let wallpaperData = { weCount: 0, customCount: 0, items: [] };
  let currentShiftPx = 0;

  function saveState(patch) {
    Object.assign(state, patch);
    ipcRenderer.invoke('config:set', state);
    applyDynamicVariables();
    applyBodyFlags();
    tagPageElements();
    updateZenButtonIcon();
    updateWaveCenterOffset();
  }

  const style = document.createElement('style');
  style.id = 'ym-wp-mod-styles';
  style.textContent = `
    :root {
      --wp-brightness: 0.75;
      --wp-blur: 0px;
      --lg-bg-alpha: 0.18;
      --lg-spec-alpha: 0.75;
      --lg-rim-alpha: 0.36;
      --lg-blur: 22px;
      --ym-wave-shift: 0px;
    }

    /* Прозрачная база */
    html, body, #__next, .ym-dark-theme, .ym-light-theme {
      background: transparent !important;
      background-color: transparent !important;
    }

    html *, body * {
      --ym-background-color-primary-enabled-basic: transparent !important;
      --ym-background-color-primary-enabled-content: rgba(12, 12, 18, 0.16) !important;
      --ym-background-color-primary-enabled-vibe: transparent !important;
      --ym-background-color-primary-enabled-header: transparent !important;
      --ym-background-color-primary-enabled-player: rgba(18, 20, 28, var(--lg-bg-alpha)) !important;
    }

    /* Чистые контейнеры без серых рамок */
    [class*="NavbarDesktop_root"],
    [class*="DefaultLayout_root"],
    [class*="MainPage_root"],
    [class*="VibePage_root"],
    [class*="VibeBlock_root"],
    [class*="VibePlayerBar_root"],
    [class*="VibePlayerBar_progress"],
    [class*="VibePlayerControls_root"] {
      background: transparent !important;
      background-color: transparent !important;
      border: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    /* Убираем рекламу */
    [class*="NavbarDesktopAnimatedDownloadBar"],
    [class*="PlayerBar_adPopup"],
    [class*="AudioAd_"] {
      display: none !important;
    }

    /* Приподнимаем профиль «Антон Радаев / Плюс» над кнопкой настроек */
    [class*="NavbarDesktopUserWidget_root"],
    [class*="NavbarDesktop_user"],
    [class*="NavbarDesktop_root"] > div:last-child {
      margin-bottom: 52px !important;
    }

    /* ================= ЕДИНЫЙ ПЕРЕЕЗД ВСЕГО БЛОКА ВОЛНЫ В ЦЕНТР ================= */
    [class*="MainPage_root"],
    [class*="MainPage_vibe"],
    [class*="VibePage_root"] {
      overflow: visible !important;
    }

    [class*="VibePage_root"] {
      transform: translate3d(var(--ym-wave-shift, 0px), 0, 0) !important;
      transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1) !important;
    }

    /* ================= ФИКС СЪЕЗЖАНИЯ НАЗВАНИЯ ТРЕКА ПРИ НАЖАТИИ СТОП/ПАУЗЫ ================= */
    [class*="VibePlayerbarMeta_artists"] {
      display: none !important;
    }

    [class*="VibePlayerbarTimecodeContent_root"],
    [class*="VibePlayerbarTimecodeContent_center"] {
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      text-align: center !important;
    }

    [class*="VibePage_textContainer"],
    [class*="VibeButton_root"],
    [class*="VibeButton_button"],
    [class*="VibeButton_titleContainer"] {
      justify-content: center !important;
      text-align: center !important;
    }

    /* ================= ЖИДКОЕ СТЕКЛО (LIQUID GLASS) ================= */
    button[class*="VibePlayerBar_button"]:not([class*="_play"]),
    [data-ym-part="vibe-capsule"],
    [data-ym-part="vibe-side-btn"] button,
    [class*="VibeContextButton_trigger"],
    [class*="VibeBlock_settingsButton"],
    [class*="VibeResetButton_button"],
    [class*="NavbarDesktop_navigation"] a[class*="active"],
    [class*="NavbarDesktop_navigation"] a:hover,
    [class*="PlayerBarDesktopWithBackgroundProgressBar_playerBar"],
    #ym-sidebar-wp-btn,
    #ym-zen-eye-btn {
      background: linear-gradient(
        145deg,
        rgba(255, 255, 255, calc(var(--lg-bg-alpha) + 0.14)) 0%,
        rgba(255, 255, 255, calc(var(--lg-bg-alpha) * 0.35)) 50%,
        rgba(255, 255, 255, calc(var(--lg-bg-alpha) + 0.08)) 100%
      ) !important;
      backdrop-filter: blur(var(--lg-blur)) saturate(200%) brightness(1.06) !important;
      -webkit-backdrop-filter: blur(var(--lg-blur)) saturate(200%) brightness(1.06) !important;
      border: 1px solid rgba(255, 255, 255, var(--lg-rim-alpha)) !important;
      box-shadow:
        inset 0 1.5px 2px 0 rgba(255, 255, 255, var(--lg-spec-alpha)),
        inset 0 -1.5px 3px 0 rgba(255, 255, 255, calc(var(--lg-spec-alpha) * 0.28)),
        0 8px 24px -4px rgba(0, 0, 0, 0.45) !important;
      transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease, background 0.18s ease, opacity 0.28s ease, visibility 0.28s ease, bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1) !important;
    }

    [class*="VibePlayerbarTimecodeContent_root"],
    [class*="VibePlayerBar_playButtonIcon"],
    [class*="VibePlayerControls_playButtonIcon"],
    [class*="SonataFullscreenControlsDesktop_playPauseButtonIcon"] {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    button[class*="VibePlayerBar_button"]:not([class*="_play"]):hover,
    [data-ym-part="vibe-capsule"]:hover,
    #ym-sidebar-wp-btn:hover,
    #ym-zen-eye-btn:hover {
      transform: translateY(-1px) scale(1.04) !important;
      box-shadow:
        inset 0 2px 2.5px 0 rgba(255, 255, 255, calc(var(--lg-spec-alpha) + 0.2)),
        inset 0 -2px 3px 0 rgba(255, 255, 255, calc(var(--lg-spec-alpha) * 0.4)),
        0 12px 28px -4px rgba(0, 0, 0, 0.55) !important;
    }

    /* Кнопка Play */
    body:not(.ym-glass-play-btn) button[class*="VibePlayerBar_button_play"],
    body:not(.ym-glass-play-btn) button[class*="VibePlayerBar_playButton"],
    body:not(.ym-glass-play-btn) button[class*="VibePlayerControls_playButton"] {
      background: #fed42b !important;
      color: #000 !important;
      border: none !important;
      box-shadow: 0 6px 20px rgba(254, 212, 43, 0.35) !important;
    }
    body:not(.ym-glass-play-btn) button[class*="VibePlayerBar_button_play"] svg,
    body:not(.ym-glass-play-btn) button[class*="VibePlayerBar_playButton"] svg,
    body:not(.ym-glass-play-btn) button[class*="VibePlayerControls_playButton"] svg {
      fill: #000 !important;
      color: #000 !important;
    }

    body.ym-glass-play-btn button[class*="VibePlayerBar_button_play"],
    body.ym-glass-play-btn button[class*="VibePlayerBar_playButton"],
    body.ym-glass-play-btn button[class*="VibePlayerControls_playButton"],
    body.ym-glass-play-btn button[class*="SonataFullscreenControlsDesktop_sonataPlayButton"] {
      border-radius: 50% !important;
      background: radial-gradient(
        circle at 30% 25%,
        rgba(255, 255, 255, calc(var(--lg-bg-alpha) + 0.26)) 0%,
        rgba(255, 255, 255, calc(var(--lg-bg-alpha) * 0.5)) 55%,
        rgba(255, 255, 255, calc(var(--lg-bg-alpha) + 0.14)) 100%
      ) !important;
      backdrop-filter: blur(var(--lg-blur)) saturate(220%) brightness(1.15) !important;
      border: 1px solid rgba(255, 255, 255, calc(var(--lg-rim-alpha) + 0.18)) !important;
      box-shadow:
        inset 0 2px 3px 0 rgba(255, 255, 255, 0.85),
        inset 0 -2px 4px 0 rgba(255, 255, 255, 0.3),
        0 8px 24px rgba(0, 0, 0, 0.45) !important;
      color: #fff !important;
    }
    body.ym-glass-play-btn button[class*="VibePlayerBar_button_play"] svg,
    body.ym-glass-play-btn button[class*="VibePlayerBar_playButton"] svg,
    body.ym-glass-play-btn button[class*="VibePlayerControls_playButton"] svg,
    body.ym-glass-play-btn button[class*="SonataFullscreenControlsDesktop_sonataPlayButton"] svg {
      fill: #fff !important;
      color: #fff !important;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4)) !important;
    }

    /* ================= ZEN MODE (КНОПКА ГЛАЗ В ПРАВОМ НИЖНЕМ УГЛУ) ================= */
    [class*="NavbarDesktop_root"],
    [class*="DefaultLayout_navbar"],
    [class*="Navbar_root"],
    [class*="VibePage_wheel"],
    #ym-sidebar-wp-btn {
      transition: opacity 0.32s ease, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), visibility 0.32s ease !important;
    }

    html.ym-zen-mode [class*="NavbarDesktop_root"],
    html.ym-zen-mode [class*="DefaultLayout_navbar"],
    html.ym-zen-mode [class*="Navbar_root"],
    html.ym-zen-mode [class*="VibePage_wheel"],
    html.ym-zen-mode [class*="Vibes_root"],
    html.ym-zen-mode [class*="VibesAgent_root"],
    html.ym-zen-mode #ym-sidebar-wp-btn,
    body.ym-zen-mode #ym-sidebar-wp-btn {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
      transform: translateX(-30px) !important;
    }

    /* ================= ОТКЛЮЧЕНИЕ ЭЛЕМЕНТОВ ПЛЕЕРА ================= */
    body.ym-hide-p-cover [class*="VibePage_albumCover"],
    body.ym-hide-p-cover [class*="PlayerBarDesktopWithBackgroundProgressBar_coverContainer"] {
      visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
    }

    body.ym-hide-artist-backdrop [class*="VibePage_artistCover"],
    body.ym-hide-artist-backdrop [class*="VibeArtistCover_root"] {
      visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
    }

    body.ym-hide-p-title [class*="VibePlayerbarTrackName_"],
    body.ym-hide-p-title [class*="VibePlayerbarTimecodeContent_trackName"],
    body.ym-hide-p-title [class*="VibePlayerbarTimecodeContent_explicitMark"],
    body.ym-hide-p-title [class*="PlayerBarDesktopWithBackgroundProgressBar_meta"] [class*="title"] {
      visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
    }

    body.ym-hide-p-artist [class*="VibeDynamicArtists_"],
    body.ym-hide-p-artist [class*="VibePage_textContainer_playing"] [class*="VibePage_text__"],
    body.ym-hide-p-artist [data-ym-part="vibe-artist"],
    body.ym-hide-p-artist [class*="PlayerBarDesktopWithBackgroundProgressBar_artists"],
    body.ym-hide-p-artist [class*="PlayerBarDesktopWithBackgroundProgressBar_artistLink"],
    body.ym-hide-p-artist [class*="PlayerBarDesktopWithBackgroundProgressBar_description"] {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    body.ym-hide-p-pill [data-ym-part="vibe-capsule"],
    body.ym-hide-p-pill [class*="VibePlayerbarMeta_slider"],
    body.ym-hide-p-pill [class*="VibePlayerbarTimecodeContent_root"] {
      visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
    }

    body.ym-hide-p-sidebtns [data-ym-part="vibe-side-btn"],
    body.ym-hide-p-sidebtns button[class*="VibePlayerBar_button"]:not([class*="_play"]),
    body.ym-hide-p-sidebtns [class*="VibePlayerBar_changeVolume"],
    body.ym-hide-p-sidebtns [class*="PlayerBarDesktopWithBackgroundProgressBar_infoButtons"],
    body.ym-hide-p-sidebtns [class*="PlayerBarDesktopWithBackgroundProgressBar_settingsButton"] {
      visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
    }

    body.ym-hide-p-skipbtns [class*="VibePlayerControls_skipButton"],
    body.ym-hide-p-skipbtns [class*="SonataFullscreenControlsDesktop_sonataButton"]:not([class*="_play"]):not([class*="Play"]) {
      visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
    }

    body.ym-hide-vibe-title [class*="VibePage_context"],
    body.ym-hide-vibe-title [class*="VibeContext_root"],
    body.ym-hide-vibe-title [class*="VibeContextButton_root"],
    body.ym-hide-vibe-title [data-ym-part="vibe-heading"] {
      visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
    }

    body.ym-hide-vibe-ai [class*="VibePage_words"] {
      visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
    }

    body.ym-soft-vibe [class*="VibeBlock_vibeAnimation"],
    body.ym-soft-vibe [class*="VibePage_vibeAnimation"],
    body.ym-soft-vibe [class*="VibeBlock_root"] video,
    body.ym-soft-vibe [class*="VibePage_root"] video,
    body.ym-soft-vibe [class*="VibeBlock_root"] canvas,
    body.ym-soft-vibe [class*="VibePage_root"] canvas {
      mix-blend-mode: screen !important;
      mask-image: radial-gradient(circle at center, rgba(0,0,0,0.95) 22%, rgba(0,0,0,0) 62%) !important;
      -webkit-mask-image: radial-gradient(circle at center, rgba(0,0,0,0.95) 22%, rgba(0,0,0,0) 62%) !important;
      background: transparent !important;
    }
    body:not(.ym-soft-vibe) [class*="VibeBlock_vibeAnimation"],
    body:not(.ym-soft-vibe) [class*="VibePage_vibeAnimation"],
    body:not(.ym-soft-vibe) [class*="VibeBlock_root"] video,
    body:not(.ym-soft-vibe) [class*="VibePage_root"] video,
    body:not(.ym-soft-vibe) [class*="VibeBlock_root"] canvas,
    body:not(.ym-soft-vibe) [class*="VibePage_root"] canvas {
      display: none !important; opacity: 0 !important;
    }

    /* СКРЫТИЕ ПУНКТОВ МЕНЮ */
    body.ym-hide-nav-search [data-ym-nav="search"] { display: none !important; }
    body.ym-hide-nav-trends [data-ym-nav="trends"] { display: none !important; }
    body.ym-hide-nav-concerts [data-ym-nav="concerts"] { display: none !important; }
    body.ym-hide-nav-podcasts [data-ym-nav="podcasts"] { display: none !important; }
    body.ym-hide-nav-collection [data-ym-nav="collection"] { display: none !important; }
    body.ym-hide-nav-plus [data-ym-nav="plus"] { display: none !important; }
    body.ym-hide-nav-pins [class*="NavbarDesktop_pins"], body.ym-hide-nav-pins [data-ym-nav="pins"] { display: none !important; }

    body.ym-hide-vibe-carousel [class*="VibePage_wheel"],
    body.ym-hide-vibe-carousel [class*="Vibes_root"],
    body.ym-hide-vibe-carousel [class*="VibesAgent_root"],
    body.ym-hide-vibe-carousel [class*="VibeAgentCard_root"] {
      visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
    }

    /* Нижний плеер и ползунок громкости открываются поверх Глазика (9500 > 9000) */
    [class*="PlayerBarDesktopWithBackgroundProgressBar_playerBar"] {
      overflow: visible !important;
      z-index: 9500 !important;
    }
    [data-floating-ui-portal],
    [class*="Popover_"],
    [class*="ChangeVolume_"] {
      z-index: 99996 !important;
    }

    /* ФОНОВЫЕ ОБОИ */
    #ym-wp-layer {
      position: fixed !important; inset: 0 !important;
      width: 100vw !important; height: 100vh !important;
      z-index: -1 !important; pointer-events: none !important;
      overflow: hidden !important; background: #050508 !important;
    }
    #ym-wp-video {
      width: 100% !important; height: 100% !important;
      object-fit: cover !important;
      filter: brightness(var(--wp-brightness)) blur(var(--wp-blur)) !important;
    }

    /* КНОПКИ УПРАВЛЕНИЯ */
    #ym-sidebar-wp-btn {
      position: fixed !important; left: 14px !important; bottom: 14px !important;
      width: 192px !important; height: 38px !important; border-radius: 12px !important;
      color: #fff !important; font-family: 'YSText', sans-serif !important;
      font-size: 13px !important; font-weight: 600 !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      gap: 9px !important; cursor: pointer !important; z-index: 99990 !important;
    }

    #ym-zen-eye-btn {
      position: fixed !important; right: 18px !important; bottom: 16px !important;
      width: 40px !important; height: 40px !important; border-radius: 50% !important;
      color: rgba(255, 255, 255, 0.88) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      cursor: pointer !important; z-index: 9000 !important;
    }
    html.ym-has-bottom-bar #ym-zen-eye-btn,
    body.ym-has-bottom-bar #ym-zen-eye-btn {
      bottom: 110px !important;
    }
    html.ym-zen-mode #ym-zen-eye-btn,
    body.ym-zen-mode #ym-zen-eye-btn {
      opacity: 0.35 !important;
    }
    html.ym-zen-mode #ym-zen-eye-btn:hover,
    body.ym-zen-mode #ym-zen-eye-btn:hover {
      opacity: 1 !important;
    }

    #ym-top-window-bar {
      position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important;
      height: 32px !important; z-index: 99999 !important; display: flex !important; justify-content: space-between !important; pointer-events: none !important;
    }
    #ym-top-drag { flex: 1 !important; height: 100% !important; -webkit-app-region: drag !important; pointer-events: auto !important; }
    #ym-top-win-btns { display: flex !important; height: 32px !important; -webkit-app-region: no-drag !important; pointer-events: auto !important; }
    .ym-w-btn {
      width: 42px !important; height: 32px !important; border: none !important; background: transparent !important;
      color: rgba(255,255,255,0.7) !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important;
    }
    .ym-w-btn:hover { background: rgba(255,255,255,0.12) !important; color: #fff !important; }
    .ym-w-btn.close:hover { background: #e81123 !important; color: #fff !important; }

    /* МОДАЛКА */
    #ym-wp-modal-backdrop {
      position: fixed !important; inset: 0 !important; background: rgba(0, 0, 0, 0.42) !important;
      z-index: 99998 !important; display: flex !important; align-items: center !important; justify-content: center !important;
      transition: background 0.2s ease !important;
    }
    #ym-wp-modal-backdrop.ym-hidden { display: none !important; }
    #ym-wp-modal-backdrop.peek-mode { background: transparent !important; }

    #ym-wp-modal {
      width: 820px !important; max-width: 94vw !important; max-height: 90vh !important;
      background: linear-gradient(145deg, rgba(24, 18, 38, 0.88), rgba(14, 12, 24, 0.92)) !important;
      backdrop-filter: blur(30px) saturate(190%) !important;
      border: 1px solid rgba(255, 255, 255, 0.22) !important;
      border-radius: 20px !important; display: flex !important; flex-direction: column !important;
      padding: 20px 24px !important; color: #fff !important; font-family: 'YSText', sans-serif !important; gap: 14px !important; overflow-y: auto !important;
      transition: opacity 0.2s ease, background 0.2s ease, backdrop-filter 0.2s ease !important;
    }
    #ym-wp-modal.peek-mode {
      background: rgba(14, 12, 24, 0.05) !important;
      backdrop-filter: none !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }
    #ym-wp-modal.peek-mode .hide-on-peek { opacity: 0.08 !important; }

    .wp-m-header { display: flex !important; justify-content: space-between !important; align-items: center !important; }
    .wp-m-title { font-size: 17px !important; font-weight: 800 !important; }
    .wp-m-stats { font-size: 12px !important; color: #c084fc !important; margin-left: 10px !important; }
    .wp-m-close { width: 30px !important; height: 30px !important; border-radius: 50% !important; border: 1px solid rgba(255,255,255,0.18) !important; background: rgba(255,255,255,0.08) !important; color: #fff !important; cursor: pointer !important; }
    .wp-section-box { background: rgba(255, 255, 255, 0.04) !important; border: 1px solid rgba(255, 255, 255, 0.1) !important; border-radius: 14px !important; padding: 12px 14px !important; display: flex !important; flex-direction: column !important; gap: 10px !important; }
    .wp-sec-title { font-size: 12px !important; font-weight: 700 !important; color: rgba(255,255,255,0.85) !important; display: flex !important; justify-content: space-between !important; align-items: center !important; }
    .wp-carousel-wrap { display: flex !important; align-items: center !important; gap: 8px !important; }
    .wp-car-arrow { width: 28px !important; height: 54px !important; border-radius: 10px !important; border: 1px solid rgba(255,255,255,0.18) !important; background: rgba(255,255,255,0.08) !important; color: #fff !important; cursor: pointer !important; flex-shrink: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; }
    .wp-carousel-track { flex: 1 !important; display: flex !important; gap: 10px !important; overflow-x: auto !important; scroll-behavior: smooth !important; padding-bottom: 2px !important; }
    .wp-carousel-track::-webkit-scrollbar { display: none !important; }
    .wp-toggle-card { min-width: 152px !important; padding: 9px 12px !important; border-radius: 11px !important; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03)) !important; border: 1px solid rgba(255,255,255,0.14) !important; display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 10px !important; cursor: pointer !important; flex-shrink: 0 !important; }
    .wp-tc-info { display: flex !important; flex-direction: column !important; gap: 2px !important; }
    .wp-tc-name { font-size: 12px !important; font-weight: 700 !important; color: #fff !important; }
    .wp-tc-state { font-size: 10px !important; color: #4ade80 !important; }
    .wp-toggle-card.is-hidden .wp-tc-state { color: rgba(255,255,255,0.4) !important; }
    .lg-switch { position: relative !important; width: 36px !important; height: 20px !important; border-radius: 12px !important; background: rgba(255,255,255,0.18) !important; border: 1px solid rgba(255,255,255,0.25) !important; flex-shrink: 0 !important; }
    .lg-switch::after { content: '' !important; position: absolute !important; top: 2px !important; left: 2px !important; width: 14px !important; height: 14px !important; border-radius: 50% !important; background: #fff !important; transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1) !important; }
    .wp-toggle-card:not(.is-hidden) .lg-switch { background: linear-gradient(135deg, #9333ea, #c084fc) !important; border-color: #e9d5ff !important; }
    .wp-toggle-card:not(.is-hidden) .lg-switch::after { transform: translateX(16px) !important; }
    .wp-m-toolbar { display: flex !important; justify-content: space-between !important; align-items: center !important; }
    .wp-m-tabs, .wp-m-actions { display: flex !important; gap: 8px !important; }
    .wp-tab-btn, .wp-act-btn { padding: 6px 13px !important; border-radius: 9px !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; background: rgba(255, 255, 255, 0.07) !important; color: #fff !important; font-size: 12px !important; font-weight: 600 !important; cursor: pointer !important; }
    .wp-tab-btn.active { background: linear-gradient(135deg, #9333ea, #a855f7) !important; border-color: #e9d5ff !important; }
    .wp-m-grid { height: 185px !important; overflow-y: auto !important; display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 10px !important; }
    .wp-card { position: relative !important; height: 86px !important; border-radius: 10px !important; overflow: hidden !important; background: rgba(255, 255, 255, 0.04) !important; border: 2px solid rgba(255, 255, 255, 0.1) !important; cursor: pointer !important; display: flex !important; flex-direction: column !important; justify-content: flex-end !important; }
    .wp-card.active { border-color: #c084fc !important; box-shadow: 0 0 14px rgba(168, 85, 247, 0.55) !important; }
    .wp-card-thumb { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; object-fit: cover !important; }
    .wp-card-off-center { position: absolute !important; inset: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 12px !important; font-weight: 700 !important; color: rgba(255,255,255,0.65) !important; }
    .wp-card-badge { position: absolute !important; top: 5px !important; right: 5px !important; padding: 2px 6px !important; border-radius: 4px !important; background: rgba(147, 51, 234, 0.85) !important; font-size: 9px !important; font-weight: 800 !important; z-index: 2 !important; }
    .wp-card-label { position: relative !important; z-index: 2 !important; background: linear-gradient(transparent, rgba(0,0,0,0.9)) !important; padding: 10px 7px 5px 7px !important; font-size: 11px !important; font-weight: 600 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
    .wp-sliders-grid { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 12px !important; padding-top: 6px !important; border-top: 1px solid rgba(255,255,255,0.1) !important; }
    .wp-slider-col { display: flex !important; flex-direction: column !important; gap: 5px !important; font-size: 11px !important; color: rgba(255,255,255,0.85) !important; }
    .wp-slider-col input[type="range"] { -webkit-appearance: none !important; width: 100% !important; height: 5px !important; border-radius: 4px !important; background: rgba(255, 255, 255, 0.22) !important; outline: none !important; cursor: pointer !important; }
    .wp-slider-col input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none !important; width: 14px !important; height: 14px !important; border-radius: 50% !important; background: #fff !important; cursor: pointer !important; }
  `;

  function applyDynamicVariables() {
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty('--wp-brightness', (state.wpBrightness / 100).toFixed(2));
    root.style.setProperty('--wp-blur', `${state.wpBlur}px`);
    root.style.setProperty('--lg-bg-alpha', (state.glassOpacity / 100).toFixed(2));
    root.style.setProperty('--lg-spec-alpha', (state.glassSpecular / 100).toFixed(2));
    root.style.setProperty('--lg-rim-alpha', ((state.glassSpecular / 100) * 0.52).toFixed(2));
    root.style.setProperty('--lg-blur', `${state.glassBlur}px`);
  }

  function applyBodyFlags() {
    const root = document.documentElement;
    const b = document.body;
    if (root) root.classList.toggle('ym-zen-mode', state.zenMode);
    if (!b) return;

    // Проверяем: если мы на главной («Моя волна»), Глазик ВСЕГДА внизу (16px).
    // Если открыта любая другая страница и виден нижний плеер — Глазик поднимается на 110px.
    const vibeRoot = document.querySelector('[class*="VibePage_root"]');
    const isOnMainVibePage = Boolean(vibeRoot && vibeRoot.getBoundingClientRect().height > 100);
    const bottomPlayer = document.querySelector('[class*="PlayerBarDesktopWithBackgroundProgressBar_playerBar"]');
    const hasBottomBar = !isOnMainVibePage && Boolean(bottomPlayer && bottomPlayer.getBoundingClientRect().height > 20);

    if (root) root.classList.toggle('ym-has-bottom-bar', hasBottomBar);
    b.classList.toggle('ym-has-bottom-bar', hasBottomBar);
    zenEyeBtn.style.setProperty('bottom', hasBottomBar ? '110px' : '16px', 'important');

    // Снимаем изолирующие контексты с родителей нижнего плеера, чтобы ползунок громкости (z-index: 9500) был поверх Глазика (z-index: 9000)
    if (bottomPlayer) {
      let p = bottomPlayer.parentElement;
      while (p && p !== document.documentElement) {
        p.style.setProperty('z-index', 'auto', 'important');
        p.style.setProperty('isolation', 'auto', 'important');
        p.style.setProperty('contain', 'none', 'important');
        p = p.parentElement;
      }
    }

    b.classList.toggle('ym-soft-vibe', state.softVibeGlow);
    b.classList.toggle('ym-glass-play-btn', state.glassPlayBtn);
    b.classList.toggle('ym-zen-mode', state.zenMode);

    b.classList.toggle('ym-hide-nav-search', state.hideNavSearch);
    b.classList.toggle('ym-hide-nav-trends', state.hideNavTrends);
    b.classList.toggle('ym-hide-nav-concerts', state.hideNavConcerts);
    b.classList.toggle('ym-hide-nav-podcasts', state.hideNavPodcasts);
    b.classList.toggle('ym-hide-nav-collection', state.hideNavCollection);
    b.classList.toggle('ym-hide-nav-plus', state.hideNavPlus);
    b.classList.toggle('ym-hide-nav-pins', state.hideNavPins);
    b.classList.toggle('ym-hide-vibe-carousel', state.hideVibeCarousel);

    b.classList.toggle('ym-hide-p-cover', state.hidePlayerCover);
    b.classList.toggle('ym-hide-artist-backdrop', state.hideArtistBackdrop);
    b.classList.toggle('ym-hide-p-title', state.hidePlayerTitle);
    b.classList.toggle('ym-hide-p-artist', state.hidePlayerArtist);
    b.classList.toggle('ym-hide-p-pill', state.hidePlayerPill);
    b.classList.toggle('ym-hide-p-sidebtns', state.hidePlayerSideBtns);
    b.classList.toggle('ym-hide-p-skipbtns', state.hidePlayerSkipBtns);
    b.classList.toggle('ym-hide-vibe-title', state.hideVibeTitle);
    b.classList.toggle('ym-hide-vibe-ai', state.hideVibeAiText);
  }

  function updateWaveCenterOffset() {
    const vibeRoot = document.querySelector('[class*="VibePage_root"]');
    const anchor =
      document.querySelector('[class*="VibePage_playerBlock"]') ||
      document.querySelector('[class*="VibePage_vibeAnimation"]');

    if (!vibeRoot || !anchor) {
      if (currentShiftPx !== 0) {
        currentShiftPx = 0;
        document.documentElement.style.setProperty('--ym-wave-shift', '0px');
      }
      return;
    }

    if (!state.hideVibeCarousel && !state.zenMode) {
      if (currentShiftPx !== 0) {
        currentShiftPx = 0;
        document.documentElement.style.setProperty('--ym-wave-shift', '0px');
      }
      return;
    }

    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0) return;

    const naturalCenterX = (rect.left - currentShiftPx) + rect.width / 2;

    let targetCenterX = window.innerWidth / 2;
    if (!state.zenMode) {
      const navEl = document.querySelector('[class*="NavbarDesktop_root"]');
      const navWidth = navEl ? navEl.getBoundingClientRect().width : 210;
      targetCenterX = Math.round(window.innerWidth / 2 + navWidth * 0.25);
    }

    const desiredShift = Math.round(targetCenterX - naturalCenterX);
    if (Math.abs(desiredShift - currentShiftPx) > 2) {
      currentShiftPx = desiredShift;
      document.documentElement.style.setProperty('--ym-wave-shift', `${currentShiftPx}px`);
    }
  }

  function tagPageElements() {
    const navRoot = document.querySelector('[class*="NavbarDesktop_root"]');
    if (navRoot) {
      const links = navRoot.querySelectorAll('a, button');
      links.forEach(el => {
        const txt = (el.textContent || '').trim();
        const row = el.closest('li') || el;
        if (txt === 'Поиск') row.setAttribute('data-ym-nav', 'search');
        else if (txt.includes('Для вас') || txt.includes('Тренды')) row.setAttribute('data-ym-nav', 'trends');
        else if (txt === 'Концерты') row.setAttribute('data-ym-nav', 'concerts');
        else if (txt.includes('Книги') || txt.includes('подкасты')) row.setAttribute('data-ym-nav', 'podcasts');
        else if (txt === 'Коллекция') row.setAttribute('data-ym-nav', 'collection');
        else if (txt.includes('Ваш Плюс')) row.setAttribute('data-ym-nav', 'plus');
      });
    }

    const progressRow = document.querySelector('[class*="VibePlayerBar_progress"]');
    if (progressRow) {
      Array.from(progressRow.children).forEach(child => {
        const hasTrackInfo = child.querySelector(
          '[class*="VibePlayerbarTimecode"], [class*="VibePlayerbarTrackName"], [class*="VibePlayerbarMeta"]'
        ) || child.matches('[class*="VibePlayerbar"]');

        if (hasTrackInfo) {
          child.setAttribute('data-ym-part', 'vibe-capsule');
        } else {
          child.setAttribute('data-ym-part', 'vibe-side-btn');
        }
      });
    }

    const textContainers = document.querySelectorAll(
      '[class*="VibePage_text__"], [class*="VibeDynamicArtists_root"], [class*="VibePage_button"], [class*="VibeButton_root"]'
    );
    textContainers.forEach(el => {
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      if (txt === 'Моя волна') {
        el.setAttribute('data-ym-part', 'vibe-heading');
      } else {
        el.setAttribute('data-ym-part', 'vibe-artist');
      }
    });
  }

  const wpLayer = document.createElement('div');
  wpLayer.id = 'ym-wp-layer';
  wpLayer.innerHTML = `<video id="ym-wp-video" loop muted autoplay playsinline></video>`;

  const topBar = document.createElement('div');
  topBar.id = 'ym-top-window-bar';
  topBar.innerHTML = `
    <div id="ym-top-drag"></div>
    <div id="ym-top-win-btns">
      <button class="ym-w-btn" id="ym-w-min"><svg width="10" height="10" viewBox="0 0 10 10"><rect y="4.5" width="10" height="1" fill="currentColor"/></svg></button>
      <button class="ym-w-btn" id="ym-w-max"><svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" stroke="currentColor" stroke-width="1" fill="none"/></svg></button>
      <button class="ym-w-btn close" id="ym-w-close"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.2"/></svg></button>
    </div>
  `;

  const sidebarBtn = document.createElement('button');
  sidebarBtn.id = 'ym-sidebar-wp-btn';
  sidebarBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d8b4fe" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
    <span>Настройки и Обои</span>
  `;

  const zenEyeBtn = document.createElement('button');
  zenEyeBtn.id = 'ym-zen-eye-btn';
  zenEyeBtn.title = 'Скрыть / показать всё, кроме блока волны';

  function updateZenButtonIcon() {
    if (state.zenMode) {
      zenEyeBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      `;
    } else {
      zenEyeBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      `;
    }
  }
  updateZenButtonIcon();

  const playerModules = [
    { key: 'hidePlayerCover', label: 'Обложка трека', invert: true },
    { key: 'hideArtistBackdrop', label: 'Силуэт артиста', invert: true },
    { key: 'hidePlayerTitle', label: 'Название трека', invert: true },
    { key: 'hidePlayerArtist', label: 'Автор трека', invert: true },
    { key: 'hidePlayerPill', label: 'Капсула трека', invert: true },
    { key: 'hidePlayerSideBtns', label: 'Лайк / Звук / Ещё', invert: true },
    { key: 'hidePlayerSkipBtns', label: 'Кнопки Пред / След', invert: true },
    { key: 'glassPlayBtn', label: 'Стеклянный Play', invert: false },
    { key: 'hideVibeTitle', label: 'Текст «Моя волна»', invert: true },
    { key: 'hideVibeAiText', label: 'AI-подпись волны', invert: true },
    { key: 'softVibeGlow', label: 'Сфера волны', invert: false }
  ];

  const navModules = [
    { key: 'hideVibeCarousel', label: 'Карусель вайбов', invert: true },
    { key: 'hideNavPlus', label: 'Ваш Плюс', invert: true },
    { key: 'hideNavTrends', label: 'Для вас и Тренды', invert: true },
    { key: 'hideNavConcerts', label: 'Концерты', invert: true },
    { key: 'hideNavPodcasts', label: 'Книги и подкасты', invert: true },
    { key: 'hideNavCollection', label: 'Коллекция', invert: true },
    { key: 'hideNavPins', label: 'Закрепы снизу', invert: true },
    { key: 'hideNavSearch', label: 'Поиск', invert: true }
  ];

  const modalBackdrop = document.createElement('div');
  modalBackdrop.id = 'ym-wp-modal-backdrop';
  modalBackdrop.className = 'ym-hidden';
  modalBackdrop.innerHTML = `
    <div id="ym-wp-modal">
      <div class="wp-m-header hide-on-peek">
        <div>
          <span class="wp-m-title">Кастомизация плеера и Живые обои</span>
          <span class="wp-m-stats" id="wp-stats-text">Wallpaper Engine: 0 | Своя папка: 0</span>
        </div>
        <button class="wp-m-close" id="wp-close-btn">✕</button>
      </div>

      <div class="wp-section-box hide-on-peek">
        <div class="wp-sec-title">
          <span>Элементы плеера по кускам</span>
        </div>
        <div class="wp-carousel-wrap">
          <button class="wp-car-arrow" data-scroll-target="car-player" data-dir="-1">◀</button>
          <div class="wp-carousel-track" id="car-player"></div>
          <button class="wp-car-arrow" data-scroll-target="car-player" data-dir="1">▶</button>
        </div>
      </div>

      <div class="wp-section-box hide-on-peek">
        <div class="wp-sec-title">
          <span>Кнопки левого меню и Карусель «Моей волны»</span>
        </div>
        <div class="wp-carousel-wrap">
          <button class="wp-car-arrow" data-scroll-target="car-nav" data-dir="-1">◀</button>
          <div class="wp-carousel-track" id="car-nav"></div>
          <button class="wp-car-arrow" data-scroll-target="car-nav" data-dir="1">▶</button>
        </div>
      </div>

      <div class="wp-m-toolbar hide-on-peek">
        <div class="wp-m-tabs">
          <button class="wp-tab-btn active" data-tab="all">Все обои</button>
          <button class="wp-tab-btn" data-tab="we">Wallpaper Engine</button>
          <button class="wp-tab-btn" data-tab="custom">Своя папка</button>
        </div>
        <div class="wp-m-actions">
          <button class="wp-act-btn" id="wp-refresh-btn">Обновить</button>
          <button class="wp-act-btn" id="wp-folder-btn">Папка .mp4</button>
        </div>
      </div>

      <div class="wp-m-grid hide-on-peek" id="wp-cards-grid"></div>

      <div class="wp-sliders-grid">
        <div class="wp-slider-col">
          <span class="hide-on-peek">Яркость обоев</span>
          <input type="range" id="sl-wp-bright" min="10" max="100" value="${state.wpBrightness}">
        </div>
        <div class="wp-slider-col">
          <span class="hide-on-peek">Размытие обоев</span>
          <input type="range" id="sl-wp-blur" min="0" max="30" value="${state.wpBlur}">
        </div>
        <div class="wp-slider-col">
          <span class="hide-on-peek">Плотность стекла</span>
          <input type="range" id="sl-lg-opacity" min="4" max="65" value="${state.glassOpacity}">
        </div>
        <div class="wp-slider-col">
          <span class="hide-on-peek">Сила бликов</span>
          <input type="range" id="sl-lg-spec" min="10" max="100" value="${state.glassSpecular}">
        </div>
      </div>
    </div>
  `;

  function renderToggleCarousel(containerId, itemsList) {
    const container = modalBackdrop.querySelector(`#${containerId}`);
    if (!container) return;

    container.innerHTML = itemsList.map(item => {
      const val = state[item.key];
      const isEnabled = item.invert ? !val : Boolean(val);
      return `
        <div class="wp-toggle-card ${isEnabled ? '' : 'is-hidden'}" data-key="${item.key}">
          <div class="wp-tc-info">
            <span class="wp-tc-name">${item.label}</span>
            <span class="wp-tc-state">${isEnabled ? 'Включено' : 'Скрыто'}</span>
          </div>
          <div class="lg-switch"></div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.wp-toggle-card').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.getAttribute('data-key');
        saveState({ [key]: !state[key] });
        renderToggleCarousel(containerId, itemsList);
      });
    });
  }

  function setWallpaperVideo(url) {
    state.wallpaperUrl = url || '';
    const videoEl = wpLayer.querySelector('#ym-wp-video');
    if (!videoEl) return;

    if (!state.wallpaperUrl) {
      videoEl.removeAttribute('src');
      videoEl.load();
      wpLayer.style.display = 'none';
    } else {
      wpLayer.style.display = 'block';
      if (videoEl.src !== state.wallpaperUrl) {
        videoEl.src = state.wallpaperUrl;
      }
      videoEl.play().catch(() => {});
    }
    ipcRenderer.invoke('config:set', state);
  }

  function renderWallpaperCards() {
    const grid = modalBackdrop.querySelector('#wp-cards-grid');
    const stats = modalBackdrop.querySelector('#wp-stats-text');
    if (!grid || !stats) return;

    stats.textContent = `Wallpaper Engine: ${wallpaperData.weCount} | Своя папка: ${wallpaperData.customCount}`;

    const filtered = wallpaperData.items.filter(item => {
      if (currentFilter === 'we') return item.source === 'we';
      if (currentFilter === 'custom') return item.source === 'custom';
      return true;
    });

    let html = `
      <div class="wp-card ${!state.wallpaperUrl ? 'active' : ''}" data-url="">
        <div class="wp-card-off-center">Выкл</div>
        <div class="wp-card-label">Стандартный фон</div>
      </div>
    `;

    for (const item of filtered) {
      const isSelected = state.wallpaperUrl === item.videoUrl;
      const badge = item.source === 'we' ? 'WE' : 'MP4';
      const thumbMedia = item.previewUrl
        ? `<img class="wp-card-thumb" src="${item.previewUrl}" loading="lazy" alt="">`
        : `<video class="wp-card-thumb" src="${item.videoUrl}" muted preload="metadata"></video>`;

      html += `
        <div class="wp-card ${isSelected ? 'active' : ''}" data-url="${item.videoUrl}">
          ${thumbMedia}
          <span class="wp-card-badge">${badge}</span>
          <div class="wp-card-label">${item.title}</div>
        </div>
      `;
    }

    grid.innerHTML = html;
    grid.querySelectorAll('.wp-card').forEach(card => {
      card.addEventListener('click', () => {
        setWallpaperVideo(card.getAttribute('data-url'));
        renderWallpaperCards();
      });
    });
  }

  async function refreshWallpapers() {
    wallpaperData = await ipcRenderer.invoke('wallpaper:scan');
    renderWallpaperCards();
  }

  let eventsInitialized = false;

  function bindEventsOnce() {
    if (eventsInitialized) return;
    eventsInitialized = true;

    topBar.querySelector('#ym-w-min').addEventListener('click', () => ipcRenderer.send('window:minimize'));
    topBar.querySelector('#ym-w-max').addEventListener('click', () => ipcRenderer.send('window:maximize'));
    topBar.querySelector('#ym-w-close').addEventListener('click', () => ipcRenderer.send('window:close'));

    zenEyeBtn.addEventListener('click', () => {
      saveState({ zenMode: !state.zenMode });
    });

    window.addEventListener('resize', () => {
      currentShiftPx = 0;
      document.documentElement.style.setProperty('--ym-wave-shift', '0px');
      updateWaveCenterOffset();
    });

    sidebarBtn.addEventListener('click', async () => {
      modalBackdrop.classList.remove('ym-hidden');
      renderToggleCarousel('car-player', playerModules);
      renderToggleCarousel('car-nav', navModules);
      await refreshWallpapers();
    });

    modalBackdrop.querySelector('#wp-close-btn').addEventListener('click', () => {
      modalBackdrop.classList.add('ym-hidden');
    });

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) modalBackdrop.classList.add('ym-hidden');
    });

    modalBackdrop.querySelectorAll('.wp-car-arrow').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = modalBackdrop.querySelector(`#${btn.getAttribute('data-scroll-target')}`);
        const dir = Number(btn.getAttribute('data-dir'));
        if (target) target.scrollBy({ left: dir * 320, behavior: 'smooth' });
      });
    });

    modalBackdrop.querySelectorAll('.wp-carousel-track').forEach(track => {
      track.addEventListener('wheel', (e) => {
        e.preventDefault();
        track.scrollLeft += e.deltaY;
      });
    });

    modalBackdrop.querySelectorAll('.wp-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modalBackdrop.querySelectorAll('.wp-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-tab');
        renderWallpaperCards();
      });
    });

    modalBackdrop.querySelector('#wp-refresh-btn').addEventListener('click', refreshWallpapers);
    modalBackdrop.querySelector('#wp-folder-btn').addEventListener('click', () => {
      ipcRenderer.invoke('wallpaper:openFolder');
    });

    const modalEl = modalBackdrop.querySelector('#ym-wp-modal');
    const sliders = modalBackdrop.querySelectorAll('input[type="range"]');
    sliders.forEach(s => {
      s.addEventListener('mousedown', () => {
        modalEl.classList.add('peek-mode');
        modalBackdrop.classList.add('peek-mode');
      });
    });
    window.addEventListener('mouseup', () => {
      modalEl.classList.remove('peek-mode');
      modalBackdrop.classList.remove('peek-mode');
    });

    modalBackdrop.querySelector('#sl-wp-bright').addEventListener('input', (e) => {
      saveState({ wpBrightness: Number(e.target.value) });
    });
    modalBackdrop.querySelector('#sl-wp-blur').addEventListener('input', (e) => {
      saveState({ wpBlur: Number(e.target.value) });
    });
    modalBackdrop.querySelector('#sl-lg-opacity').addEventListener('input', (e) => {
      saveState({ glassOpacity: Number(e.target.value) });
    });
    modalBackdrop.querySelector('#sl-lg-spec').addEventListener('input', (e) => {
      saveState({ glassSpecular: Number(e.target.value) });
    });
  }

  function keepAliveMount() {
    if (!document.documentElement) return;

    if (!document.getElementById('ym-wp-mod-styles') && document.head) {
      document.head.appendChild(style);
      applyDynamicVariables();
    }
    if (!document.getElementById('ym-wp-layer')) {
      document.documentElement.prepend(wpLayer);
      setWallpaperVideo(state.wallpaperUrl);
    }
    if (!document.getElementById('ym-top-window-bar')) {
      document.documentElement.appendChild(topBar);
    }
    if (!document.getElementById('ym-sidebar-wp-btn')) {
      document.documentElement.appendChild(sidebarBtn);
    }
    if (!document.getElementById('ym-zen-eye-btn')) {
      document.documentElement.appendChild(zenEyeBtn);
    }
    if (!document.getElementById('ym-wp-modal-backdrop')) {
      document.documentElement.appendChild(modalBackdrop);
    }

    applyBodyFlags();
    tagPageElements();
    updateWaveCenterOffset();
    bindEventsOnce();
  }

  setInterval(keepAliveMount, 300);
  window.addEventListener('DOMContentLoaded', () => {
    keepAliveMount();
    renderToggleCarousel('car-player', playerModules);
    renderToggleCarousel('car-nav', navModules);
    refreshWallpapers();
  });
})();


