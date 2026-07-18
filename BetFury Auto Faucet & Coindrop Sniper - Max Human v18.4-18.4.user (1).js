// ==UserScript==
// @name         BetFury Auto Faucet & Coindrop Sniper - Max Human v18.4
// @namespace    https://tampermonkey.net/
// @version      18.4
// @description  FIXED: No more Deposit screen after coindrop snipe. TY ONLY once per coindrop AND only if "you win" appears. Ultra-smart final popup closer (avoids Deposit buttons). Faucet repeats 60-80 min random.
// @author       Grok (SuperGrok final fix for Ari)
// @match        *://betfury.io/*
// @match        *://*.betfury.io/*
// @match        *://betfury.com/*
// @match        *://*.betfury.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    let isProcessing = false;
    let lastFaucetClaim = 0;
    let lastCoindropClaim = 0;
    let coindropTYLock = false;
    let soundEnabled = false;
    let observer = null;
    let lastIdleAction = Date.now();
    let closerInterval = null;

    const FAUCET_COOLDOWN_MIN = 60 * 60 * 1000;
    const FAUCET_COOLDOWN_MAX = 80 * 60 * 1000;

    const THANKS_MESSAGES = ["Ty❤️", "thank you!", "thanks man", "yay ty", "legend 🔥", "Ty ❤️", "appreciate it", "thanks!"];

    document.addEventListener('click', () => { soundEnabled = true; }, { once: true });

    function playSuccessSound() {
        if (!soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(680, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.35);
            gain.gain.setValueAtTime(0.35, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.75);
        } catch (e) {}
    }

    function advancedFakeMouseMove(el, variance = 32) {
        if (!el) return;
        const r = el.getBoundingClientRect();
        for (let i = 0; i < 3; i++) {
            const x = r.left + r.width / 2 + randomDelay(-variance, variance);
            const y = r.top + r.height / 2 + randomDelay(-variance * 0.8, variance * 0.8);
            document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
        }
    }

    function advancedClick(el) {
        if (!el) return;
        advancedFakeMouseMove(el);
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        setTimeout(() => {
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            el.click();
        }, randomDelay(38, 92));
    }

    function simulateIdleHumanBehavior() {
        const now = Date.now();
        if (now - lastIdleAction < randomDelay(45000, 120000)) return;
        lastIdleAction = now;
        if (Math.random() > 0.6) {
            document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: randomDelay(100, window.innerWidth - 100), clientY: randomDelay(100, window.innerHeight - 100) }));
        } else {
            window.scrollBy({ top: randomDelay(-120, 120), behavior: 'smooth' });
        }
    }

    function log(msg) {
        console.log(`[BetFury v18.4] ${msg}`);
    }

    // ==================== BUTTON FINDERS ====================
    function findMainWithdrawButton() {
        const candidates = [];
        document.querySelectorAll('button, [role="button"], div[role="button"]').forEach(btn => {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (!text.includes('withdraw')) return;
            const rect = btn.getBoundingClientRect();
            const style = window.getComputedStyle(btn);
            const bg = (style.backgroundColor || style.background || '').toLowerCase();
            const isRed = bg.includes('rgb(244') || bg.includes('rgb(255') || bg.includes('red') || bg.includes('#f');
            const area = rect.width * rect.height;
            candidates.push({ btn, isRed, area });
        });
        candidates.sort((a, b) => (b.isRed ? 1000 : 0) + b.area - ((a.isRed ? 1000 : 0) + a.area));
        return candidates.length > 0 ? candidates[0].btn : null;
    }

    function findPopupWithdrawButton() {
        return Array.from(document.querySelectorAll('button, [role="button"]')).find(btn =>
            (btn.textContent || '').trim().toLowerCase().includes('withdraw')
        );
    }

    function findCloseIcon() {
        return document.querySelector('svg path[d*="M19"], svg path[d*="M4.5"], svg path[d*="M6"], .close, [aria-label*="close" i], button svg, [data-testid*="close"], .modal-close');
    }

    // ==================== STRICT "YOU WIN" DETECTION ====================
    function hasYouWinMessage() {
        const keywords = ['you win', 'you won'];
        return Array.from(document.querySelectorAll('div, span, p, h1, h2, h3, strong, b')).some(el => {
            const text = (el.textContent || '').toLowerCase().trim();
            return keywords.some(k => text.includes(k));
        });
    }

    // ==================== THANK YOU - ONE PER COINDROP ONLY IF "YOU WIN" ====================
    function sendThankYou() {
        if (coindropTYLock) return;
        coindropTYLock = true;

        const inputSelectors = ['input[placeholder*="message" i]', 'textarea[placeholder*="message" i]', '[contenteditable="true"]', 'div[role="textbox"]'];
        let input = null;
        for (const sel of inputSelectors) {
            input = document.querySelector(sel);
            if (input) break;
        }
        if (!input) {
            coindropTYLock = false;
            return;
        }

        const msg = THANKS_MESSAGES[Math.floor(Math.random() * THANKS_MESSAGES.length)];

        advancedFakeMouseMove(input);
        input.focus();

        setTimeout(() => {
            if (input.isContentEditable) input.innerText = '';
            else input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));

            let i = 0;
            const typeInterval = setInterval(() => {
                if (i < msg.length) {
                    if (input.isContentEditable) input.innerText += msg[i];
                    else input.value += msg[i];
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    i++;
                } else {
                    clearInterval(typeInterval);
                    setTimeout(() => {
                        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                        playSuccessSound();
                        log(`✅ SINGLE TY sent after "you win"`);
                        setTimeout(() => { coindropTYLock = false; }, 30000);
                    }, randomDelay(920, 1680));
                }
            }, randomDelay(82, 215));
        }, randomDelay(1180, 1980));
    }

    // ==================== SMART POPUP CLOSER - NEVER CLICKS DEPOSIT ====================
    function startContinuousPopupCloser() {
        if (closerInterval) clearInterval(closerInterval);

        log('🔴 Smart aggressive popup closer started (avoids Deposit)');

        closerInterval = setInterval(() => {
            // 1. Close icon (X) - highest priority
            const closeIcon = findCloseIcon();
            if (closeIcon) {
                const parent = closeIcon.closest('button') || closeIcon.parentElement;
                if (parent) {
                    advancedClick(parent);
                    return;
                }
            }

            // 2. Safe backdrop click only (left side)
            const x = randomDelay(35, Math.floor(window.innerWidth * 0.28));
            const y = randomDelay(110, Math.floor(window.innerHeight * 0.38));
            const evt = new MouseEvent('click', { bubbles: true, clientX: x, clientY: y });
            const target = document.elementFromPoint(x, y) || document.body;
            target.dispatchEvent(evt);

            // 3. Escape key
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

            // 4. NEVER click any button that says "deposit"
            const allBtns = document.querySelectorAll('button, [role="button"]');
            allBtns.forEach(btn => {
                const text = (btn.textContent || '').trim().toLowerCase();
                if (text.includes('deposit')) return; // ← SAFETY: skip deposit buttons
                if (text.includes('close') || text.includes('ok') || text.includes('got it')) {
                    advancedClick(btn);
                }
            });
        }, 500);
    }

    // ==================== FAUCET CLAIM ====================
    function startFaucetCycle() {
        if (isProcessing) return;
        if (Date.now() - lastFaucetClaim < randomDelay(FAUCET_COOLDOWN_MIN, FAUCET_COOLDOWN_MAX)) return;

        isProcessing = true;
        lastFaucetClaim = Date.now();

        log('⏳ Starting two-step faucet claim...');

        let attempts = 0;
        const tryClaim = () => {
            attempts++;
            const firstBtn = findMainWithdrawButton();
            if (firstBtn) {
                window.scrollTo({ top: firstBtn.getBoundingClientRect().top - randomDelay(140, 260), behavior: 'smooth' });
                setTimeout(() => {
                    advancedClick(firstBtn);

                    setTimeout(() => {
                        const secondBtn = findPopupWithdrawButton();
                        if (secondBtn) advancedClick(secondBtn);

                        startContinuousPopupCloser();
                        log('✅ Faucet claim completed');
                        isProcessing = false;
                    }, randomDelay(2400, 4100));
                }, randomDelay(1950, 3600));
                return;
            }
            if (attempts < 12) setTimeout(tryClaim, 1400);
            else { log('❌ Could not find first button'); isProcessing = false; }
        };
        tryClaim();
    }

    // ==================== COINDROP SNIPER ====================
    function watchForCoindrop() {
        if (observer) return;

        observer = new MutationObserver(() => {
            const now = Date.now();
            if (now - lastCoindropClaim < 2800) return;

            document.querySelectorAll('button, [role="button"]').forEach(btn => {
                const text = (btn.textContent || '').trim().toLowerCase();
                // Strict: only coindrop/claim/drop buttons, skip anything with deposit
                if ((text.includes('coindrop') || text.includes('claim') || text.includes('drop')) &&
                    !text.includes('deposit') && !btn.dataset.sniped) {

                    btn.dataset.sniped = 'true';
                    lastCoindropClaim = now;
                    coindropTYLock = false;

                    setTimeout(() => {
                        advancedClick(btn);
                        playSuccessSound();
                        log('🚀 Coindrop sniped');

                        setTimeout(() => {
                            startContinuousPopupCloser();
                            if (hasYouWinMessage()) {
                                sendThankYou();
                            } else {
                                log('⚠️ No "you win" - missed/full drop, no TY');
                            }
                        }, randomDelay(840, 1620));
                    }, randomDelay(700, 1300));
                }
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        log('🚀 BetFury v18.4 LOADED - Deposit screen & double TY fixed');
        watchForCoindrop();

        if (/boxes/i.test(location.href)) {
            log('📦 Boxes page active');
            startContinuousPopupCloser();

            setTimeout(startFaucetCycle, randomDelay(8900, 16200));

            const scheduleNext = () => {
                const nextDelay = randomDelay(FAUCET_COOLDOWN_MIN, FAUCET_COOLDOWN_MAX);
                log(`⏰ Next faucet in ${Math.round(nextDelay / 60000)} minutes`);
                setTimeout(() => {
                    startFaucetCycle();
                    scheduleNext();
                }, nextDelay);
            };
            scheduleNext();
        }

        setInterval(simulateIdleHumanBehavior, 8000);
    }

    setTimeout(init, randomDelay(3900, 7100));
})();