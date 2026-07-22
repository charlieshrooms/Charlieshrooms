// ==UserScript==
// @name         Script King Lite Love
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Lightweight BetFury helper for older phones with automatic private Love Link messages, heart menu, coindrop sniper, auto-claim and compact Dice strategies.
// @author       Charlie + ChatGPT
// @match        https://betfury.com/*
// @match        https://www.betfury.com/*
// @match        https://*.betfury.com/*
// @match        https://betfury.io/*
// @match        https://www.betfury.io/*
// @match        https://*.betfury.io/*
// @updateURL    https://raw.githubusercontent.com/charlieshrooms/Charlieshrooms/main/Script-King-Lite-Love.user.js
// @downloadURL  https://raw.githubusercontent.com/charlieshrooms/Charlieshrooms/main/Script-King-Lite-Love.user.js
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @connect      identitytoolkit.googleapis.com
// @connect      securetoken.googleapis.com
// @connect      distance-5baec-default-rtdb.firebaseio.com
// @connect      translate.googleapis.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self || window.__SK_LITE_LOVE__) return;
  window.__SK_LITE_LOVE__ = true;

  const VERSION = '1.2.0';
  const TAG = `[Script King Lite Love ${VERSION}]`;
  const KEY = 'skLiteLoveV1';
  const RUN_LOCK_KEY = 'skLiteLoveDiceRunLock';
  const DICE_PATH = /\/casino\/games\/dice/i;
  const FIREBASE = {
    apiKey: 'AIzaSyCQ3iFwmHO16Gze5I9dHRDul-OszfqDCWI',
    databaseURL: 'https://distance-5baec-default-rtdb.firebaseio.com'
  };
  const LOVE_ROOM_ID = 'love_22b94d444a992561f8ca8c3d6408f5c49b828b497df29108d4e9e1e61dddbc60';
  const LOVE_POLL_MS = 3000;
  const LOVE_MAX_MESSAGES = 30;

  const DEFAULTS = {
    menuOpen: false,
    heartX: 18,
    heartY: 90,
    cardX: 70,
    cardY: 90,
    cardVisible: true,
    messageIndexToday: 0,
    messageDate: '',
    messagesToday: [],
    sniperEnabled: true,
    sniperProfile: 'medium',
    autoClaimEnabled: false,
    autoClaimIntervalMinutes: 60,
    lastAutoClaimAt: 0,
    diceStrategy: 'off',
    diceBasePercent: 0.0125,
    diceRunning: false,
    loveLinkEnabled: true,
    loveRoom: LOVE_ROOM_ID,
    loveName: '',
    lovePartnerName: '',
    loveLastSeenId: '',
    loveAuthToken: '',
    loveRefreshToken: '',
    loveTokenExpiresAt: 0,
    loveMessages: [],
    loveStatus: 'Not connected',
    showLatestLoveNote: true
  };

  const SUPPORTIVE_MESSAGES = [
    "I'm still here.",
    "I'm not going anywhere.",
    "We're still us.",
    "You haven't lost me.",
    "Distance isn't goodbye.",
    "I'm holding on too.",
    "Nothing about this changed how I feel.",
    "I haven't stopped choosing you.",
    "You're still home to me.",
    "I'm beside you, even from here.",
    "This isn't the end of us.",
    "I'm only a message away.",
    "You don't have to face this alone.",
    "I'm in your corner.",
    "We're getting through this together.",
    "I haven't gone anywhere in my heart.",
    "You still matter to me every day.",
    "I'm waiting with you, not away from you.",
    "We're apart, not finished.",
    "I still choose you today.",
    "You are not forgotten.",
    "I carry you with me.",
    "Our connection is still here.",
    "You can lean on me.",
    "I haven't let go.",
    "You're not by yourself in this.",
    "I'm listening, even when it's quiet.",
    "I still see us.",
    "I'm not giving up on us.",
    "You are still loved here.",
    "We will keep finding each other.",
    "I'm staying close in every way I can.",
    "This distance doesn't get the final word.",
    "I still think of you as home.",
    "I'm here when you need me.",
    "I haven't disappeared.",
    "We are still connected.",
    "You don't have to be strong every minute.",
    "I'm carrying some of this with you.",
    "You're allowed to miss me. I miss you too.",
    "I still believe in what we have.",
    "I'm not leaving you behind.",
    "You are worth staying for.",
    "Even from here, I'm with you.",
    "We haven't stopped being a team.",
    "You're still my person.",
    "I'm not walking away.",
    "We can be quiet and still be close.",
    "I'm here. That's the whole message.",
    "You still have me."
  ];

  const PROFILES = {
    superfast: [50, 500],
    medium: [500, 1000],
    lazy: [1000, 2000]
  };

  const STRATEGIES = {
    off: { label: 'Off', chance: 32.67, loss: 1, maxPct: 0 },
    finalBase: { label: 'Final Base', chance: 32.67, loss: 1.50, maxPct: 0.03 },
    guarded95: { label: 'CM Guarded 95', chance: 70, loss: 1.35, maxPct: 0.025 },
    moneyGlitch: { label: 'CM Money Glitch', chance: 30, loss: 1.65, maxPct: 0.03 },
    intuition: { label: 'Original Intuition', chance: 40, loss: 1.40, maxPct: 0.02 }
  };

  let state = { ...loadState(), loveRoom: LOVE_ROOM_ID };
  saveState();
  let observer = null;
  let sniperBusy = false;
  let claimTimer = null;
  let loveTimer = null;
  let loveSyncBusy = false;
  let diceLoopToken = 0;
  let diceLossStreak = 0;
  let diceCurrentBet = 0;
  let heartEl = null;
  let menuEl = null;
  let cardEl = null;

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }

  function setState(patch) {
    state = { ...state, ...patch };
    saveState();
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function rand(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.width > 2 && r.height > 2;
  }
  function textOf(el) { return String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function ensureDailyMessages() {
    const date = todayKey();
    if (state.messageDate === date && Array.isArray(state.messagesToday) && state.messagesToday.length === 2) return;
    const a = hashString(`${date}:one`) % SUPPORTIVE_MESSAGES.length;
    let b = hashString(`${date}:two`) % SUPPORTIVE_MESSAGES.length;
    if (b === a) b = (b + 7) % SUPPORTIVE_MESSAGES.length;
    setState({ messageDate: date, messagesToday: [a, b], messageIndexToday: 0 });
  }

  function currentMessage() {
    ensureDailyMessages();
    const idx = state.messagesToday[state.messageIndexToday % 2];
    return SUPPORTIVE_MESSAGES[idx] || SUPPORTIVE_MESSAGES[0];
  }

  function css() {
    const style = document.createElement('style');
    style.id = 'sk-lite-love-css';
    style.textContent = `
      #skll-heart{position:fixed;z-index:2147483646;width:48px;height:48px;border:0;border-radius:50%;display:grid;place-items:center;font-size:28px;cursor:pointer;touch-action:none;background:radial-gradient(circle at 35% 30%,#fff0f5 0,#ff9fba 45%,#c51f57 100%);box-shadow:0 8px 25px rgba(197,31,87,.35),inset 0 1px 0 rgba(255,255,255,.65);animation:skllBeat 2.8s ease-in-out infinite}
      @keyframes skllBeat{0%,88%,100%{transform:scale(1)}92%{transform:scale(1.08)}96%{transform:scale(.98)}}
      #skll-menu,#skll-card{position:fixed;z-index:2147483645;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:linear-gradient(145deg,rgba(55,17,35,.96),rgba(25,12,24,.97));border:1px solid rgba(255,172,203,.38);box-shadow:0 14px 38px rgba(0,0,0,.42),0 0 24px rgba(255,96,154,.14);backdrop-filter:blur(8px)}
      #skll-menu{width:min(306px,calc(100vw - 20px));max-height:min(76vh,610px);overflow:auto;border-radius:20px;padding:14px;display:none}
      #skll-menu.open{display:block}
      #skll-card{width:min(220px,calc(100vw - 24px));border-radius:18px;padding:14px 16px;text-align:center;touch-action:none;cursor:grab}
      #skll-card .heart{font-size:19px;margin-bottom:5px}
      #skll-card .msg{font-family:Georgia,serif;font-size:17px;line-height:1.28;color:#ffe8f0;text-shadow:0 1px 8px rgba(255,90,145,.16)}
      #skll-card .from{margin-top:8px;font-size:11px;color:#e8bacb}
      #skll-card .shared{margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,190,214,.18);font-size:13px;line-height:1.3;color:#ffd5e5}
      #skll-card .tiny{margin-top:6px;font-size:10px;color:#bb8c9f}
      .skll-love-box{display:flex;flex-direction:column;gap:7px}
      .skll-love-history{max-height:190px;overflow:auto;padding:7px;border-radius:12px;background:rgba(0,0,0,.16)}
      .skll-love-msg{margin:5px 0;padding:7px 9px;border-radius:12px;background:rgba(255,255,255,.06);font-size:12px;line-height:1.35;word-break:break-word}
      .skll-love-msg.mine{background:rgba(255,95,152,.16)}
      .skll-love-meta{font-size:9px;color:#b98ca0;margin-top:3px}
      .skll-textarea{width:100%;min-height:58px;resize:vertical;box-sizing:border-box}
      .skll-code{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.04em}
      .skll-title{font-weight:800;font-size:16px;color:#ffd5e5;margin:0 0 10px}.skll-sub{font-size:11px;color:#cda3b4;margin:-5px 0 10px}
      .skll-sec{border-top:1px solid rgba(255,255,255,.08);padding-top:11px;margin-top:11px}.skll-sec h4{margin:0 0 8px;font-size:13px;color:#ffb7d0}
      .skll-row{display:flex;align-items:center;gap:8px;margin:7px 0}.skll-row>*{min-width:0}.skll-row label{flex:1;font-size:12px;color:#f2dce5}
      .skll-btn,.skll-select,.skll-input{border:1px solid rgba(255,182,208,.25);background:rgba(255,255,255,.06);color:#fff;border-radius:11px;padding:8px 9px;font:inherit;font-size:12px}
      .skll-btn{cursor:pointer}.skll-btn.primary{background:linear-gradient(135deg,#ff5f98,#bd245c);font-weight:700}.skll-btn.full{width:100%}
      .skll-select,.skll-input{width:132px}.skll-select option{background:#29121f}.skll-check{accent-color:#ff5f98;width:18px;height:18px}
      .skll-status{font-size:11px;color:#cba6b5;margin-top:6px;word-break:break-word}.skll-good{color:#9ff0bc}.skll-warn{color:#ffd18b}
      @media(max-width:520px){#skll-menu{font-size:13px}.skll-select,.skll-input{width:120px}#skll-card{width:190px;padding:12px 13px}#skll-card .msg{font-size:16px}}
    `;
    document.head.appendChild(style);
  }

  function drag(el, xKey, yKey) {
    let active = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const down = e => {
      if (e.button != null && e.button !== 0) return;
      active = true; moved = false;
      const p = e.touches?.[0] || e;
      sx = p.clientX; sy = p.clientY;
      const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      try { el.setPointerCapture?.(e.pointerId); } catch {}
    };
    const move = e => {
      if (!active) return;
      const p = e.touches?.[0] || e;
      const dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx)+Math.abs(dy) > 5) moved = true;
      const x = clamp(ox + dx, 4, innerWidth - el.offsetWidth - 4);
      const y = clamp(oy + dy, 4, innerHeight - el.offsetHeight - 4);
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      e.preventDefault?.();
    };
    const up = () => {
      if (!active) return;
      active = false;
      const r = el.getBoundingClientRect();
      setState({ [xKey]: Math.round(r.left), [yKey]: Math.round(r.top) });
      setTimeout(() => { el.__skllMoved = moved; }, 0);
    };
    el.addEventListener('pointerdown', down);
    addEventListener('pointermove', move, { passive:false });
    addEventListener('pointerup', up);
    el.addEventListener('touchstart', down, { passive:true });
    addEventListener('touchmove', move, { passive:false });
    addEventListener('touchend', up);
  }

  function createUI() {
    css();
    ensureDailyMessages();

    heartEl = document.createElement('button');
    heartEl.id = 'skll-heart'; heartEl.type = 'button'; heartEl.textContent = '❤️';
    heartEl.title = 'Love & tools';
    heartEl.style.left = `${clamp(state.heartX,4,innerWidth-55)}px`;
    heartEl.style.top = `${clamp(state.heartY,4,innerHeight-55)}px`;
    document.body.appendChild(heartEl);
    drag(heartEl, 'heartX', 'heartY');

    menuEl = document.createElement('section');
    menuEl.id = 'skll-menu';
    menuEl.style.left = `${clamp(state.heartX + 56,4,innerWidth-316)}px`;
    menuEl.style.top = `${clamp(state.heartY,4,innerHeight-300)}px`;
    menuEl.innerHTML = `
      <div class="skll-title">❤️ Script King Lite Love</div>
      <div class="skll-sub">Small, quiet, and on your side.</div>
      <button class="skll-btn full" id="skll-next-message">Show today's other message</button>
      <div class="skll-sec"><h4>❤️ Love Link</h4>
        <div class="skll-love-box">
          <div class="skll-row"><label>Show words card</label><input id="skll-card-toggle" class="skll-check" type="checkbox"></div>
          <div class="skll-row"><label>Show latest note on card</label><input id="skll-love-card-toggle" class="skll-check" type="checkbox"></div>
          <input id="skll-love-name" class="skll-input full" maxlength="24" placeholder="Your name">
          <input id="skll-love-partner" class="skll-input full" maxlength="24" placeholder="Their name">
          <div class="skll-status skll-good">Private Love Link connected automatically ❤️</div>
          <div class="skll-love-history" id="skll-love-history"><div class="skll-status">Connecting to your shared notes…</div></div>
          <textarea id="skll-love-compose" class="skll-input skll-textarea" maxlength="500" placeholder="Write a note..."></textarea>
          <button class="skll-btn primary full" id="skll-love-send">Send ❤️</button>
          <div class="skll-status" id="skll-love-status">Not connected</div>
        </div>
      </div>
      <div class="skll-sec"><h4>🎯 Coindrop sniper</h4>
        <div class="skll-row"><label>Sniper enabled</label><input id="skll-sniper-toggle" class="skll-check" type="checkbox"></div>
        <div class="skll-row"><label>Speed</label><select id="skll-profile" class="skll-select"><option value="superfast">Super Fast</option><option value="medium">Medium</option><option value="lazy">Lazy</option></select></div>
        <div class="skll-status" id="skll-sniper-status">Watching for “Get Coindrop”.</div>
      </div>
      <div class="skll-sec"><h4>⚡ Auto claim</h4>
        <div class="skll-row"><label>Enabled</label><input id="skll-claim-toggle" class="skll-check" type="checkbox"></div>
        <div class="skll-row"><label>Every minutes</label><input id="skll-claim-minutes" class="skll-input" type="number" min="5" max="1440" step="5"></div>
        <button class="skll-btn full" id="skll-claim-now">Open claim page now</button>
      </div>
      <div class="skll-sec"><h4>🎲 Dice strategies</h4>
        <div class="skll-row"><label>Strategy</label><select id="skll-strategy" class="skll-select">${Object.entries(STRATEGIES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></div>
        <div class="skll-row"><label>Base bet (% balance)</label><input id="skll-base-pct" class="skll-input" type="number" min="0.0001" max="3" step="0.0001"></div>
        <button class="skll-btn primary full" id="skll-dice-run">Start Dice</button>
        <div class="skll-status" id="skll-dice-status">Dice starts manually and only on the Dice page.</div>
      </div>
      <div class="skll-sec"><div class="skll-status">v${VERSION} · Separate from Script King</div></div>
    `;
    document.body.appendChild(menuEl);

    cardEl = document.createElement('aside');
    cardEl.id = 'skll-card';
    cardEl.style.left = `${clamp(state.cardX,4,innerWidth-230)}px`;
    cardEl.style.top = `${clamp(state.cardY,4,innerHeight-150)}px`;
    document.body.appendChild(cardEl);
    drag(cardEl, 'cardX', 'cardY');

    bindUI();
    renderAll();
  }

  function bindUI() {
    heartEl.addEventListener('click', () => {
      if (heartEl.__skllMoved) { heartEl.__skllMoved = false; return; }
      state.menuOpen = !state.menuOpen; saveState(); renderMenu();
    });
    document.getElementById('skll-next-message').onclick = () => {
      setState({ messageIndexToday: state.messageIndexToday ? 0 : 1 }); renderCard();
    };
    document.getElementById('skll-card-toggle').onchange = e => { setState({ cardVisible:e.target.checked }); renderCard(); };
    document.getElementById('skll-love-card-toggle').onchange = e => { setState({ showLatestLoveNote:e.target.checked }); renderCard(); };
    document.getElementById('skll-love-name').onchange = e => { setState({ loveName:cleanName(e.target.value) }); renderLoveHistory(); };
    document.getElementById('skll-love-partner').onchange = e => setState({ lovePartnerName:cleanName(e.target.value) });
    document.getElementById('skll-love-send').onclick = sendLoveMessage;
    document.getElementById('skll-love-compose').addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendLoveMessage(); } });
    document.getElementById('skll-sniper-toggle').onchange = e => { setState({ sniperEnabled:e.target.checked }); updateSniperStatus(); };
    document.getElementById('skll-profile').onchange = e => setState({ sniperProfile:e.target.value });
    document.getElementById('skll-claim-toggle').onchange = e => { setState({ autoClaimEnabled:e.target.checked }); scheduleAutoClaim(); };
    document.getElementById('skll-claim-minutes').onchange = e => { setState({ autoClaimIntervalMinutes:clamp(Number(e.target.value)||60,5,1440) }); scheduleAutoClaim(); };
    document.getElementById('skll-claim-now').onclick = openClaimPage;
    document.getElementById('skll-strategy').onchange = e => setState({ diceStrategy:e.target.value });
    document.getElementById('skll-base-pct').onchange = e => setState({ diceBasePercent:clamp(Number(e.target.value)||0.0125,0.0001,3) });
    document.getElementById('skll-dice-run').onclick = () => state.diceRunning ? stopDice('Stopped manually') : startDice();
  }

  function renderAll() {
    renderMenu(); renderCard();
    document.getElementById('skll-card-toggle').checked = state.cardVisible;
    document.getElementById('skll-love-card-toggle').checked = state.showLatestLoveNote;
    document.getElementById('skll-love-name').value = state.loveName;
    document.getElementById('skll-love-partner').value = state.lovePartnerName;
    renderLoveHistory();
    updateLoveStatus();
    document.getElementById('skll-sniper-toggle').checked = state.sniperEnabled;
    document.getElementById('skll-profile').value = state.sniperProfile;
    document.getElementById('skll-claim-toggle').checked = state.autoClaimEnabled;
    document.getElementById('skll-claim-minutes').value = state.autoClaimIntervalMinutes;
    document.getElementById('skll-strategy').value = state.diceStrategy;
    document.getElementById('skll-base-pct').value = state.diceBasePercent;
    updateDiceStatus(); updateSniperStatus();
  }

  function renderMenu() {
    menuEl.classList.toggle('open', !!state.menuOpen);
    if (state.menuOpen) {
      const hx = heartEl.getBoundingClientRect().left;
      const hy = heartEl.getBoundingClientRect().top;
      menuEl.style.left = `${clamp(hx + 54, 4, innerWidth - menuEl.offsetWidth - 4)}px`;
      menuEl.style.top = `${clamp(hy, 4, innerHeight - Math.min(menuEl.offsetHeight, innerHeight-8) - 4)}px`;
    }
  }

  function renderCard() {
    if (!state.cardVisible) { cardEl.style.display = 'none'; return; }
    cardEl.style.display = 'block';
    const latest = [...(state.loveMessages || [])].reverse().find(m => m && m.text && m.sender !== state.loveName) || [...(state.loveMessages || [])].reverse().find(m => m && m.text);
    const shared = state.showLatestLoveNote && latest ? `<div class="shared">${escapeHtml(latest.text)}</div><div class="tiny">${escapeHtml(latest.sender || state.lovePartnerName || 'Love Link')} · ${escapeHtml(formatLoveTime(latest.ts))}</div>` : '';
    cardEl.innerHTML = `<div class="heart">❤️</div><div class="msg">${escapeHtml(currentMessage())}</div>${shared}`;
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function cleanName(v) {
    return String(v || '').replace(/[<>\n\r]/g, '').trim().slice(0, 24);
  }

  function formatLoveTime(ts) {
    const d = new Date(Number(ts) || 0);
    if (!Number.isFinite(d.getTime()) || d.getTime() <= 0) return '';
    return d.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  async function ensureFirebaseAuth() {
    const now = Date.now();
    if (state.loveAuthToken && Number(state.loveTokenExpiresAt || 0) > now + 60000) return state.loveAuthToken;
    let endpoint, body;
    if (state.loveRefreshToken) {
      endpoint = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE.apiKey)}`;
      body = new URLSearchParams({ grant_type:'refresh_token', refresh_token:state.loveRefreshToken }).toString();
    } else {
      endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE.apiKey)}`;
      body = JSON.stringify({ returnSecureToken:true });
    }
    const res = await fetch(endpoint, {
      method:'POST',
      headers:{ 'Content-Type': state.loveRefreshToken ? 'application/x-www-form-urlencoded' : 'application/json' },
      body
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Firebase auth ${res.status}`);
    const token = data.idToken || data.id_token;
    const refresh = data.refreshToken || data.refresh_token || state.loveRefreshToken;
    const expires = Number(data.expiresIn || data.expires_in || 3600);
    setState({ loveAuthToken:token, loveRefreshToken:refresh, loveTokenExpiresAt:Date.now() + expires*1000 });
    return token;
  }

  function loveUrl(path, token) {
    const safeRoom = encodeURIComponent(state.loveRoom);
    return `${FIREBASE.databaseURL}/rooms/${safeRoom}/${path}.json?auth=${encodeURIComponent(token)}`;
  }

  async function sendLoveMessage() {
    const input = document.getElementById('skll-love-compose');
    const text = String(input?.value || '').trim().slice(0, 500);
    const sender = cleanName(document.getElementById('skll-love-name')?.value || state.loveName);
    const partner = cleanName(document.getElementById('skll-love-partner')?.value || state.lovePartnerName);
    const room = LOVE_ROOM_ID;
    if (!sender) return updateLoveStatus('Enter your name first.', true);
    if (!text) return updateLoveStatus('Write a note first.', true);
    setState({ loveName:sender, lovePartnerName:partner, loveRoom:room });
    updateLoveStatus('Sending…');
    try {
      const token = await ensureFirebaseAuth();
      const message = { text, sender, ts:Date.now(), device:localDeviceId() };
      const res = await fetch(loveUrl('messages', token), {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(message)
      });
      if (!res.ok) throw new Error(`Send failed (${res.status})`);
      if (input) input.value = '';
      await syncLoveLink(true);
      updateLoveStatus('Sent ❤️');
    } catch (err) {
      console.warn(TAG, 'Love Link send failed:', err);
      updateLoveStatus(firebaseHelp(err), true);
    }
  }

  function localDeviceId() {
    let id = localStorage.getItem('skllLoveDevice');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('skllLoveDevice', id); }
    return id;
  }

  function firebaseHelp(err) {
    const m = String(err?.message || err || 'Connection failed');
    if (/ADMIN_ONLY_OPERATION|OPERATION_NOT_ALLOWED/i.test(m)) return 'Enable Anonymous sign-in in Firebase Authentication.';
    if (/401|403|PERMISSION_DENIED/i.test(m)) return 'Firebase rules are blocking Love Link. Paste the rules from the README.';
    return `Love Link error: ${m}`;
  }

  async function syncLoveLink(manual=false) {
    if (loveSyncBusy || !state.loveLinkEnabled || !state.loveRoom) return;
    loveSyncBusy = true;
    if (manual) updateLoveStatus('Connecting…');
    try {
      const token = await ensureFirebaseAuth();
      const res = await fetch(loveUrl('messages', token), { cache:'no-store' });
      if (!res.ok) throw new Error(`Database ${res.status}`);
      const raw = await res.json();
      const messages = raw ? Object.entries(raw).map(([id,m]) => ({ id, ...m })).filter(m => m.text).sort((a,b) => Number(a.ts||0)-Number(b.ts||0)).slice(-LOVE_MAX_MESSAGES) : [];
      setState({ loveMessages:messages, loveLastSeenId:messages.at(-1)?.id || '', loveStatus:'Connected' });
      renderLoveHistory(); renderCard();
      updateLoveStatus(messages.length ? 'Connected · messages synced' : 'Connected · write the first note');
    } catch (err) {
      console.warn(TAG, 'Love Link sync failed:', err);
      updateLoveStatus(firebaseHelp(err), true);
    } finally { loveSyncBusy = false; }
  }

  function renderLoveHistory() {
    const el = document.getElementById('skll-love-history');
    if (!el) return;
    const messages = state.loveMessages || [];
    if (!state.loveRoom) { el.innerHTML = '<div class="skll-status">Connecting to your shared Love Link…</div>'; return; }
    if (!messages.length) { el.innerHTML = '<div class="skll-status">No notes yet. Write the first one below.</div>'; return; }
    el.innerHTML = messages.slice(-12).map(m => {
      const mine = m.sender === state.loveName;
      return `<div class="skll-love-msg ${mine?'mine':''}"><strong>${escapeHtml(m.sender || '❤️')}</strong><div>${escapeHtml(m.text)}</div><div class="skll-love-meta">${escapeHtml(formatLoveTime(m.ts))}</div></div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function updateLoveStatus(message, warn=false) {
    if (message) { state.loveStatus = message; saveState(); }
    const el = document.getElementById('skll-love-status');
    if (el) { el.textContent = message || state.loveStatus || 'Not connected'; el.className = `skll-status ${warn?'skll-warn':'skll-good'}`; }
  }

  function startLovePolling() {
    clearInterval(loveTimer);
    syncLoveLink(false);
    loveTimer = setInterval(() => syncLoveLink(false), LOVE_POLL_MS);
  }

  function findCoindropButtons(root=document) {
    return [...root.querySelectorAll('button,[role="button"],a')].filter(el => {
      const t = textOf(el);
      return visible(el) && (t === 'get coindrop' || t.includes('get coindrop'));
    });
  }

  function humanClick(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width*(.35+Math.random()*.3), y = r.top+r.height*(.35+Math.random()*.3);
    const opts = { bubbles:true, cancelable:true, clientX:x, clientY:y, pointerType:'mouse', isPrimary:true };
    try { el.dispatchEvent(new PointerEvent('pointerover', opts)); } catch {}
    try { el.dispatchEvent(new MouseEvent('mouseover', opts)); } catch {}
    try { el.dispatchEvent(new PointerEvent('pointerdown', {...opts, buttons:1})); } catch {}
    try { el.dispatchEvent(new MouseEvent('mousedown', {...opts, buttons:1})); } catch {}
    setTimeout(() => {
      try { el.dispatchEvent(new PointerEvent('pointerup', {...opts, buttons:0})); } catch {}
      try { el.dispatchEvent(new MouseEvent('mouseup', {...opts, buttons:0})); } catch {}
      try { el.click(); } catch {}
    }, rand(35,110));
  }

  async function inspectForDrop(root=document) {
    if (!state.sniperEnabled || sniperBusy) return;
    const btn = findCoindropButtons(root)[0];
    if (!btn || btn.dataset.skllSniped) return;
    btn.dataset.skllSniped = '1'; sniperBusy = true;
    const [min,max] = PROFILES[state.sniperProfile] || PROFILES.medium;
    updateSniperStatus('Drop found — preparing click…');
    await sleep(rand(min,max));
    if (visible(btn) && state.sniperEnabled) {
      humanClick(btn);
      updateSniperStatus('Clicked coindrop.');
    }
    await sleep(1200); sniperBusy = false;
  }

  function startSniper() {
    observer?.disconnect();
    observer = new MutationObserver(records => {
      if (!state.sniperEnabled) return;
      for (const rec of records) for (const node of rec.addedNodes) if (node.nodeType === 1) { inspectForDrop(node); inspectForDrop(document); return; }
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    setInterval(() => inspectForDrop(document), 1200);
    inspectForDrop(document);
  }

  function updateSniperStatus(msg) {
    const el = document.getElementById('skll-sniper-status');
    if (!el) return;
    el.textContent = msg || (state.sniperEnabled ? `Armed · ${state.sniperProfile}` : 'Sniper off');
    el.className = `skll-status ${state.sniperEnabled ? 'skll-good' : ''}`;
  }

  function openClaimPage() {
    const url = `${location.origin}/casino/games?autoClaim=true#skllClaim=1`;
    try { GM_openInTab(url, { active:true, insert:true, setParent:true }); }
    catch { window.open(url, '_blank', 'noopener'); }
    setState({ lastAutoClaimAt:Date.now() });
  }

  function scheduleAutoClaim() {
    clearInterval(claimTimer);
    if (!state.autoClaimEnabled) return;
    const check = () => {
      const every = state.autoClaimIntervalMinutes * 60 * 1000;
      if (Date.now() - Number(state.lastAutoClaimAt || 0) >= every) openClaimPage();
    };
    check(); claimTimer = setInterval(check, 60 * 1000);
  }

  function autoClickClaimTab() {
    const params = new URLSearchParams(location.search);
    const isClaimTab = params.get('autoClaim') === 'true' || location.hash.includes('skllClaim=1');
    if (!isClaimTab) return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      const candidates = [...document.querySelectorAll('button,[role="button"],a')].filter(visible);
      const button = candidates.find(el => /^(claim|get|collect|open|receive)(\s|$)/i.test(textOf(el)) && !/deposit|vault|withdraw|cashback|rakeback/i.test(textOf(el)));
      if (button) humanClick(button);
      if (button || attempts > 45) clearInterval(id);
    }, 900);
  }

  const SEL = {
    balance: ['[data-testid="wallet-balance"]','.balance__value','.header-wallet__value','span.currency span span'],
    amount: ['input[data-test="input-bet-amount"]','input[data-testid="bet-amount"]','.amount__center input','.dice input[type="number"]'],
    chance: ['input[data-test="input-win-chance"]','input[data-testid="win-chance"]','input[name*="chance" i]'],
    bet: ['button[data-test="button-bet"]','button[data-testid="bet-button"]'],
    result: ['[data-testid="bet-result"]','.dice-result','.result__value','.bet-result']
  };

  function firstVisible(selectors) { for (const s of selectors) { const el=[...document.querySelectorAll(s)].find(visible); if(el) return el; } return null; }
  function parseNumber(value) { const m=String(value||'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/); return m?Number(m[0]):NaN; }
  function setInput(el,value) {
    if (!el) return false;
    const proto = Object.getPrototypeOf(el), desc = Object.getOwnPropertyDescriptor(proto,'value');
    try { desc?.set ? desc.set.call(el,String(value)) : el.value=String(value); } catch { el.value=String(value); }
    el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;
  }
  function getBalance() { const el=firstVisible(SEL.balance); return el?parseNumber(el.textContent):NaN; }
  function getResultText() { return SEL.result.map(s=>[...document.querySelectorAll(s)].filter(visible).map(textOf).join(' ')).join(' '); }
  async function waitResult(before, timeout=7000) {
    const start=Date.now();
    while(Date.now()-start<timeout){ const now=getResultText(); if(now && now!==before && /(win|lose|lost|won|profit)/i.test(now)) return now; await sleep(120); }
    return '';
  }

  async function startDice() {
    if (!DICE_PATH.test(location.pathname)) { updateDiceStatus('Open the BetFury Dice page first.', true); return; }
    if (state.diceStrategy === 'off') { updateDiceStatus('Choose a Dice strategy first.', true); return; }
    if (localStorage.getItem(RUN_LOCK_KEY) && localStorage.getItem(RUN_LOCK_KEY) !== String(window.name || 'tab')) { updateDiceStatus('Another Lite Dice loop may be running.', true); return; }
    localStorage.setItem(RUN_LOCK_KEY, String(window.name || 'tab'));
    setState({ diceRunning:true }); diceLoopToken++; diceLossStreak=0; diceCurrentBet=0; renderDiceButton();
    const token=diceLoopToken, strat=STRATEGIES[state.diceStrategy];
    updateDiceStatus(`${strat.label} running.`);
    while(state.diceRunning && token===diceLoopToken){
      const balance=getBalance(), amount=firstVisible(SEL.amount), chance=firstVisible(SEL.chance), betBtn=firstVisible(SEL.bet);
      if(!Number.isFinite(balance)||!amount||!betBtn){ updateDiceStatus('Waiting for Dice controls…', true); await sleep(800); continue; }
      const base=Math.max(0.00000001,balance*(state.diceBasePercent/100));
      if(!diceCurrentBet||diceCurrentBet>balance*strat.maxPct) diceCurrentBet=base;
      const maxBet=Math.max(base,balance*strat.maxPct);
      diceCurrentBet=Math.min(Math.max(diceCurrentBet,base),maxBet);
      setInput(amount,diceCurrentBet.toFixed(8));
      if(chance) setInput(chance, strat.chance.toFixed(2));
      const before=getResultText(); humanClick(betBtn);
      const result=await waitResult(before);
      if(!state.diceRunning||token!==diceLoopToken) break;
      if(/\b(win|won|profit)\b/i.test(result)){ diceLossStreak=0; diceCurrentBet=base; updateDiceStatus(`Win · reset to ${diceCurrentBet.toFixed(8)}`); }
      else if(/\b(lose|lost|loss)\b/i.test(result)){ diceLossStreak++; diceCurrentBet=Math.min(diceCurrentBet*strat.loss,maxBet); updateDiceStatus(`Loss ${diceLossStreak} · next ${diceCurrentBet.toFixed(8)}`, true); }
      else { updateDiceStatus('Result not confirmed; retrying carefully.', true); }
      await sleep(rand(220,520));
    }
  }

  function stopDice(reason='Stopped') {
    diceLoopToken++; setState({ diceRunning:false });
    try { localStorage.removeItem(RUN_LOCK_KEY); } catch {}
    renderDiceButton(); updateDiceStatus(reason);
  }
  function renderDiceButton() { const b=document.getElementById('skll-dice-run'); if(b) b.textContent=state.diceRunning?'Stop Dice':'Start Dice'; }
  function updateDiceStatus(msg,warn=false) { const e=document.getElementById('skll-dice-status'); if(e){ e.textContent=msg||'Dice starts manually and only on the Dice page.'; e.className=`skll-status ${warn?'skll-warn':''}`; } renderDiceButton(); }

  function init() {
    console.info(TAG, 'loaded:', location.href);
    createUI(); startSniper(); scheduleAutoClaim(); autoClickClaimTab(); startLovePolling();
    addEventListener('resize', () => { renderMenu(); });
    addEventListener('beforeunload', () => { if(state.diceRunning) stopDice('Page closing'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();

// =========================================================
// CHAT AUTO-TRANSLATOR  (Spanish → English, auto-detect)
// Types Spanish, sends English — fully automated.
// =========================================================
(function initChatTranslator() {
  'use strict';

  const DEBOUNCE_MS = 700;   // wait this long after last keystroke
  const MIN_CHARS   = 2;     // don't translate single characters
  const STORAGE_KEY = 'skllChatTranslateEnabled';
  const BADGE_ID    = 'skll-translate-badge';

  // Persistent on/off toggle – defaults to enabled.
  let enabled = true;
  try { enabled = GM_getValue(STORAGE_KEY, true); } catch {}

  // BetFury chat + love compose selectors.
  const CHAT_SELECTORS = [
    '#skll-love-compose',
    'textarea[placeholder*="message" i]',
    'input[placeholder*="message" i]',
    '[contenteditable="true"]:not([readonly])',
    'div[role="textbox"]',
  ];

  function findChatInput() {
    for (const sel of CHAT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  // React-compatible value setter.
  function setReactValue(el, value) {
    if (el.isContentEditable) {
      el.textContent = value;
    } else {
      const proto = el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) {
        desc.set.call(el, value);
      } else {
        el.value = value;
      }
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Call the free Google Translate endpoint (no API key required).
  async function translateToEnglish(text) {
    const url = 'https://translate.googleapis.com/translate_a/single'
      + '?client=gtx&sl=auto&tl=en&dt=t&q='
      + encodeURIComponent(text);
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const detectedLang = data && data[2] ? String(data[2]) : '';
    if (detectedLang === 'en') return null;  // already English
    const segments = Array.isArray(data && data[0]) ? data[0] : [];
    const translated = segments.map(s => (s && s[0]) ? s[0] : '').join('');
    return translated || null;
  }

  // Show a brief badge near the bottom-right corner.
  function showBadge(text) {
    let badge = document.getElementById(BADGE_ID);
    if (!badge) {
      badge = document.createElement('div');
      badge.id = BADGE_ID;
      badge.style.cssText = [
        'position:fixed', 'bottom:76px', 'right:14px', 'z-index:2147483647',
        'background:rgba(30,215,96,.92)', 'color:#000', 'font-size:12px',
        'font-weight:700', 'padding:5px 12px', 'border-radius:20px',
        'pointer-events:none', 'transition:opacity .4s ease',
        'font-family:sans-serif', 'line-height:1.4',
      ].join(';');
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.opacity = '1';
    clearTimeout(badge._t);
    badge._t = setTimeout(() => { badge.style.opacity = '0'; }, 2600);
  }

  let debounceTimer = null;
  let lastInputEl   = null;
  let translating   = false;

  function onInput(e) {
    if (!enabled || translating) return;
    const el  = e.target;
    const raw = el.isContentEditable ? (el.textContent || '') : (el.value || '');
    const text = raw.trim();
    if (text.length < MIN_CHARS) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        translating = true;
        const result = await translateToEnglish(text);
        if (result && result !== text) {
          setReactValue(el, result);
          showBadge('🌐 Translated ✓');
        }
      } catch (_err) {
        // Silently skip — don't interrupt the user.
      } finally {
        translating = false;
      }
    }, DEBOUNCE_MS);
  }

  function attachToInput(el) {
    if (!el || el === lastInputEl) return;
    if (lastInputEl) lastInputEl.removeEventListener('input', onInput);
    el.addEventListener('input', onInput);
    lastInputEl = el;
  }

  // Watch for the chat panel being mounted (BetFury is a React SPA).
  const domObserver = new MutationObserver(() => attachToInput(findChatInput()));
  domObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  attachToInput(findChatInput());
})();
