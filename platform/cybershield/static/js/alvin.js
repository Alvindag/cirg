/**
 * AlvinAvatar — Animated SVG avatar for DAS Plc CyberShield
 * Alvin Dagbui — Assistant IT Manager character
 */
const AlvinAvatar = (() => {
  let mountEl = null;
  let blinkTimer = null;
  let breathTimer = null;
  let talkTimer = null;
  let isTalking = false;
  let currentExpression = 'neutral';
  let speakTimer = null;

  const SVG = `
<svg id="alvin-svg" viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
  <rect id="av-body" x="28" y="105" width="64" height="70" rx="8" fill="#1a3a5c"/>
  <polygon points="60,108 50,120 60,125 70,120" fill="#0e2340"/>
  <rect x="57" y="120" width="6" height="30" rx="2" fill="#E8A020"/>
  <rect x="35" y="115" width="22" height="14" rx="2" fill="#ffffff22" stroke="#E8A020" stroke-width="1"/>
  <text x="46" y="124" font-size="4" fill="#E8A020" text-anchor="middle" font-family="monospace">DAS</text>
  <text x="46" y="128" font-size="3" fill="#aaa" text-anchor="middle" font-family="monospace">ASST. IT MGR</text>
  <rect x="51" y="95" width="18" height="14" rx="4" fill="#c68642"/>
  <ellipse id="av-head" cx="60" cy="78" rx="28" ry="30" fill="#c68642"/>
  <ellipse cx="60" cy="52" rx="28" ry="12" fill="#1a0a00"/>
  <rect x="32" y="52" width="56" height="10" rx="2" fill="#1a0a00"/>
  <ellipse cx="32" cy="78" rx="5" ry="7" fill="#b5743a"/>
  <ellipse cx="88" cy="78" rx="5" ry="7" fill="#b5743a"/>
  <g id="av-eyes">
    <ellipse id="av-leye-white" cx="48" cy="76" rx="7" ry="7" fill="white"/>
    <ellipse id="av-leye-iris"  cx="48" cy="77" rx="4" ry="4" fill="#3d2b1f"/>
    <ellipse id="av-leye-pupil" cx="48.5" cy="77" rx="2" ry="2" fill="#111"/>
    <ellipse id="av-leye-shine" cx="49.5" cy="75.5" rx="1" ry="1" fill="white"/>
    <ellipse id="av-reye-white" cx="72" cy="76" rx="7" ry="7" fill="white"/>
    <ellipse id="av-reye-iris"  cx="72" cy="77" rx="4" ry="4" fill="#3d2b1f"/>
    <ellipse id="av-reye-pupil" cx="72.5" cy="77" rx="2" ry="2" fill="#111"/>
    <ellipse id="av-reye-shine" cx="73.5" cy="75.5" rx="1" ry="1" fill="white"/>
    <rect id="av-lleye-lid" x="41" y="69" width="14" height="0" rx="3" fill="#c68642"/>
    <rect id="av-rleye-lid" x="65" y="69" width="14" height="0" rx="3" fill="#c68642"/>
  </g>
  <g id="av-brows">
    <path id="av-lbrow" d="M41 68 Q48 64 55 68" stroke="#1a0a00" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path id="av-rbrow" d="M65 68 Q72 64 79 68" stroke="#1a0a00" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </g>
  <ellipse cx="60" cy="84" rx="4" ry="3" fill="#b5743a"/>
  <g id="av-mouth">
    <path id="av-mouth-smile" d="M50 94 Q60 101 70 94" stroke="#7a3a1a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse id="av-mouth-open" cx="60" cy="95" rx="0" ry="0" fill="#3a0a00"/>
    <ellipse id="av-teeth" cx="60" cy="93" rx="0" ry="0" fill="white"/>
  </g>
  <rect id="av-larm" x="10" y="108" width="20" height="50" rx="10" fill="#1a3a5c" transform-origin="20 108"/>
  <rect id="av-rarm" x="90" y="108" width="20" height="50" rx="10" fill="#1a3a5c" transform-origin="100 108"/>
  <ellipse id="av-lhand" cx="20" cy="160" rx="9" ry="9" fill="#c68642"/>
  <ellipse id="av-rhand" cx="100" cy="160" rx="9" ry="9" fill="#c68642"/>
  <g id="av-thumbsup" opacity="0">
    <rect x="93" y="145" width="10" height="18" rx="5" fill="#c68642"/>
    <rect x="96" y="138" width="7" height="12" rx="4" fill="#c68642"/>
  </g>
</svg>`;

  function mount(selector) {
    mountEl = document.querySelector(selector);
    if (!mountEl) return;
    mountEl.innerHTML = SVG;
    startBreathing();
    startBlinking();
  }

  function startBreathing() {
    if (breathTimer) clearInterval(breathTimer);
    let phase = 0;
    breathTimer = setInterval(() => {
      phase += 0.05;
      const s = 1 + Math.sin(phase) * 0.015;
      const head = document.getElementById('av-head');
      if (head) head.setAttribute('transform', `scale(1, ${s}) translate(0, ${(1-s)*60})`);
    }, 60);
  }

  function startBlinking() {
    if (blinkTimer) clearTimeout(blinkTimer);
    function scheduleBlink() {
      const delay = 2500 + Math.random() * 2500;
      blinkTimer = setTimeout(() => { blink(); scheduleBlink(); }, delay);
    }
    scheduleBlink();
  }

  function blink() {
    const ll = document.getElementById('av-lleye-lid');
    const rl = document.getElementById('av-rleye-lid');
    if (!ll || !rl) return;
    ll.setAttribute('height', '14'); rl.setAttribute('height', '14');
    setTimeout(() => { ll.setAttribute('height', '0'); rl.setAttribute('height', '0'); }, 120);
  }

  function setExpression(expr) {
    currentExpression = expr;
    const lbrow = document.getElementById('av-lbrow');
    const rbrow = document.getElementById('av-rbrow');
    const mouthSmile = document.getElementById('av-mouth-smile');
    if (!lbrow) return;
    switch(expr) {
      case 'happy':
        lbrow.setAttribute('d', 'M41 66 Q48 61 55 66');
        rbrow.setAttribute('d', 'M65 66 Q72 61 79 66');
        mouthSmile.setAttribute('d', 'M50 93 Q60 102 70 93');
        break;
      case 'concerned':
        lbrow.setAttribute('d', 'M41 68 Q48 72 55 66');
        rbrow.setAttribute('d', 'M65 66 Q72 72 79 68');
        mouthSmile.setAttribute('d', 'M50 97 Q60 93 70 97');
        break;
      case 'surprised':
        lbrow.setAttribute('d', 'M41 62 Q48 57 55 62');
        rbrow.setAttribute('d', 'M65 62 Q72 57 79 62');
        mouthSmile.setAttribute('d', 'M53 94 Q60 98 67 94');
        const mo = document.getElementById('av-mouth-open');
        if (mo) { mo.setAttribute('rx','5'); mo.setAttribute('ry','6'); mo.setAttribute('cy','96'); }
        setTimeout(() => { if (mo) { mo.setAttribute('rx','0'); mo.setAttribute('ry','0'); } }, 1500);
        break;
      default:
        lbrow.setAttribute('d', 'M41 68 Q48 64 55 68');
        rbrow.setAttribute('d', 'M65 68 Q72 64 79 68');
        mouthSmile.setAttribute('d', 'M50 94 Q60 101 70 94');
    }
  }

  function startTalking() {
    if (isTalking) return;
    isTalking = true;
    const mo = document.getElementById('av-mouth-open');
    const teeth = document.getElementById('av-teeth');
    if (!mo) return;
    let open = false;
    talkTimer = setInterval(() => {
      open = !open;
      mo.setAttribute('rx', open ? '7' : '4');
      mo.setAttribute('ry', open ? '5' : '2');
      mo.setAttribute('cy', '96');
      if (teeth) { teeth.setAttribute('rx', open ? '5' : '0'); teeth.setAttribute('ry', open ? '2' : '0'); }
    }, 180);
  }

  function stopTalking() {
    isTalking = false;
    if (talkTimer) clearInterval(talkTimer);
    const mo = document.getElementById('av-mouth-open');
    const teeth = document.getElementById('av-teeth');
    if (mo) { mo.setAttribute('rx','0'); mo.setAttribute('ry','0'); }
    if (teeth) { teeth.setAttribute('rx','0'); teeth.setAttribute('ry','0'); }
  }

  function react(type) {
    switch(type) {
      case 'correct':   setExpression('happy');    bounceHead(); break;
      case 'wrong':     setExpression('concerned'); shakeHead();  break;
      case 'celebrate': setExpression('happy');    celebrate();  break;
      default:          setExpression('neutral');
    }
  }

  function bounceHead() {
    const head = document.getElementById('av-head');
    if (!head) return;
    let count = 0;
    const t = setInterval(() => {
      count++;
      head.style.transform = `translateY(${count % 2 === 0 ? 0 : -8}px)`;
      head.style.transition = '0.15s';
      if (count > 5) { clearInterval(t); head.style.transform = ''; }
    }, 150);
  }

  function shakeHead() {
    const head = document.getElementById('av-head');
    if (!head) return;
    let count = 0;
    const t = setInterval(() => {
      count++;
      head.style.transform = `translateX(${count % 2 === 0 ? -6 : 6}px)`;
      head.style.transition = '0.1s';
      if (count > 7) { clearInterval(t); head.style.transform = ''; }
    }, 100);
  }

  function celebrate() {
    const larm = document.getElementById('av-larm');
    const rarm = document.getElementById('av-rarm');
    const lhand = document.getElementById('av-lhand');
    const rhand = document.getElementById('av-rhand');
    const thumb = document.getElementById('av-thumbsup');
    if (!larm) return;
    larm.style.transition = '0.3s'; rarm.style.transition = '0.3s';
    larm.style.transform = 'rotate(-40deg)'; rarm.style.transform = 'rotate(40deg)';
    if (lhand) { lhand.style.transition='0.3s'; lhand.setAttribute('cy','140'); }
    if (rhand) { rhand.style.transition='0.3s'; rhand.setAttribute('cy','140'); }
    if (thumb) thumb.style.opacity = '1';
    bounceHead();
    setTimeout(() => {
      larm.style.transform = ''; rarm.style.transform = '';
      if (lhand) lhand.setAttribute('cy','160');
      if (rhand) rhand.setAttribute('cy','160');
      if (thumb) thumb.style.opacity = '0';
    }, 2500);
  }

  function waveArm() {
    const rarm = document.getElementById('av-rarm');
    const rhand = document.getElementById('av-rhand');
    if (!rarm) return;
    let count = 0;
    const t = setInterval(() => {
      count++;
      rarm.style.transition = '0.2s';
      rarm.style.transform = count % 2 === 0 ? 'rotate(-20deg)' : 'rotate(10deg)';
      if (rhand) { rhand.style.transition = '0.2s'; rhand.setAttribute('cy', count % 2 === 0 ? '148' : '155'); }
      if (count > 7) { clearInterval(t); rarm.style.transform = ''; if (rhand) rhand.setAttribute('cy','160'); }
    }, 200);
  }

  function speak(text, bubbleId, onComplete) {
    const bubble = document.getElementById(bubbleId);
    if (!bubble) { if (onComplete) onComplete(); return; }
    // Cancel any still-running reveal from a previous speak() call — otherwise
    // its remaining words keep appending into this bubble and interleave with
    // the new message (visible when slides are advanced faster than ~90ms/word).
    if (speakTimer) { clearInterval(speakTimer); speakTimer = null; }
    bubble.textContent = '';
    startTalking();
    setExpression('happy');
    let i = 0;
    const words = text.split(' ');
    speakTimer = setInterval(() => {
      if (i < words.length) {
        bubble.textContent += (i > 0 ? ' ' : '') + words[i];
        i++;
      } else {
        clearInterval(speakTimer);
        speakTimer = null;
        stopTalking();
        setExpression('neutral');
        if (onComplete) setTimeout(onComplete, 800);
      }
    }, 90);
  }

  return { mount, setExpression, startTalking, stopTalking, react, waveArm, celebrate, speak, blink };
})();
