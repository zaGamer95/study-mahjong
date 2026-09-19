/* 버림패 추천기 UI */
(function () {
  'use strict';
  const { tileEl } = window.TileUI;
  const LIST_KEYS = ['hand', 'self', 'shimocha', 'toimen', 'kamicha', 'dora', 'other'];
  const SEATS = ['shimocha', 'toimen', 'kamicha'];

  const state = {
    target: 'hand',
    hand: [], self: [], shimocha: [], toimen: [], kamicha: [], dora: [], other: [],
    meldsText: '',
    threat: { shimocha: 'none', toimen: 'none', kamicha: 'none' },
    roundWind: 0,
    seatWind: 0,
  };

  const EXAMPLES = [
    {
      name: '기초: 고립패 정리',
      hand: '134m457p2346s155z9p', dora: '3s',
      note: '고립된 자패·노두패부터 정리하는 기본 패효율',
    },
    {
      name: '1샨텐 형태 선택',
      hand: '2346m0578p34678s4z', dora: '4p', self: '9m',
      note: '같은 1샨텐이라도 텐파이 후 대기가 좋은 쪽을 고른다',
    },
    {
      name: '텐파이 대기 선택',
      hand: '234569m456p789s11z', self: '1z',
      note: '삼면 대기 vs 양면 대기',
    },
    {
      name: '상대 리치 — 밀까 접을까',
      hand: '2346m0578p34678s4z', dora: '4p', self: '9m', shimocha: '1s4s8m2z9p', toimen: '5z1m', kamicha: '9s',
      threat: { shimocha: 'riichi' },
      note: '1샨텐에서 상대 리치: 현물·스지를 활용',
    },
    {
      name: '후리텐 함정',
      hand: '123456789m23p11z9s', self: '1p',
      note: '대기패를 이미 버렸다면 론 불가',
    },
    {
      name: '후로 역 확인',
      hand: '234m56p6789s11z', melds: '777z', dora: '5s',
      note: '울었을 때는 역이 있는지 반드시 확인',
    },
    {
      name: '치또이쯔',
      hand: '1133m5588p2266s17z', dora: '6z',
      note: '또이쯔가 많으면 치또이쯔도 고려',
    },
  ];

  // ───────── DOM refs
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const results = $('#results');

  // ───────── 팔레트
  function buildPalette() {
    const pal = $('#palette');
    const rows = [
      [0, 9, 0], [9, 18, 1], [18, 27, 2], [27, 34, null],
    ];
    for (const [a, b, suit] of rows) {
      const row = document.createElement('div');
      row.className = 'palette-row';
      for (let id = a; id < b; id++) {
        const el = tileEl(id, false, 'clickable');
        el.dataset.id = id;
        el.addEventListener('click', () => addTile({ id, red: false }));
        row.appendChild(el);
      }
      if (suit !== null) {
        const id = suit * 9 + 4;
        const el = tileEl(id, true, 'clickable');
        el.dataset.id = id;
        el.dataset.red = '1';
        el.style.marginLeft = '8px';
        el.addEventListener('click', () => addTile({ id, red: true }));
        row.appendChild(el);
      }
      pal.appendChild(row);
    }
  }

  function usedCounts() {
    const c = new Array(34).fill(0);
    let reds = {};
    const all = [...LIST_KEYS.flatMap((k) => state[k]), ...parseMelds().flat()];
    for (const t of all) {
      c[t.id]++;
      if (t.red) reds[t.id] = (reds[t.id] || 0) + 1;
    }
    return { c, reds };
  }

  function refreshPalette() {
    const { c, reds } = usedCounts();
    $$('#palette .tile').forEach((el) => {
      const id = +el.dataset.id;
      const full = c[id] >= 4 || (!!el.dataset.red && reds[id] >= 1);
      el.classList.toggle('dim', full);
    });
  }

  // ───────── 후로 텍스트
  function parseMelds() {
    try {
      return state.meldsText.trim() ? state.meldsText.trim().split(/\s+/).map((g) => MJ.parseTiles(g)) : [];
    } catch (e) {
      return [];
    }
  }

  function addTile(tile) {
    const { c, reds } = usedCounts();
    if (c[tile.id] >= 4) return flash('이 패는 이미 4장 모두 입력되었습니다');
    if (tile.red && reds[tile.id]) return flash('적도라는 한 장만 있습니다');
    if (state.target === 'melds') {
      const groups = state.meldsText.trim() ? state.meldsText.trim().split(/\s+/) : [];
      let last = groups.length ? groups[groups.length - 1] : '';
      let lastCount = 0;
      try { lastCount = last ? MJ.parseTiles(last).length : 0; } catch (e) { /* 무시 */ }
      if (!last || lastCount >= 3) groups.push(MJ.tileCode(tile.id, tile.red));
      else groups[groups.length - 1] = MJ.tilesToString([...MJ.parseTiles(last), tile]);
      state.meldsText = groups.join(' ');
      $('[data-text="melds"]').value = state.meldsText;
      return update();
    }
    const list = state[state.target];
    if (state.target === 'hand') {
      const max = 14 - parseMelds().length * 3;
      if (list.length >= max) return flash(`손패는 최대 ${max}장입니다`);
    }
    list.push(tile);
    syncText(state.target);
    update();
  }

  function removeTile(key, index) {
    state[key].splice(index, 1);
    syncText(key);
    update();
  }

  function syncText(key) {
    const input = $(`[data-text="${key}"]`);
    // 손패는 입력 순서(마지막 = 쯔모패)를 살리기 위해 정렬하지 않은 순서대로 표기
    input.value = key === 'hand' || key === 'self' || SEATS.includes(key) ? orderedString(state[key]) : MJ.tilesToString(state[key]);
    input.classList.remove('invalid');
    $(`[data-err="${key}"]`).textContent = '';
  }

  /** 순서를 유지한 표기: 연속된 같은 수트끼리 묶는다 */
  function orderedString(tiles) {
    let out = '';
    let run = '';
    let suit = null;
    for (const t of tiles) {
      const s = 'mpsz'[MJ.suitOf(t.id)];
      if (s !== suit && suit !== null) { out += run + suit; run = ''; }
      suit = s;
      run += t.red ? '0' : String(MJ.numOf(t.id));
    }
    if (suit) out += run + suit;
    return out;
  }

  // ───────── 입력 영역 렌더
  function renderZones() {
    for (const key of LIST_KEYS) {
      const box = $(`[data-tiles="${key}"]`);
      box.innerHTML = '';
      box.classList.toggle('empty', state[key].length === 0);
      state[key].forEach((t, i) => {
        const el = tileEl(t.id, t.red, `clickable${key === 'hand' ? '' : ' sm'}`);
        el.title = '클릭하면 삭제';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          removeTile(key, i);
        });
        box.appendChild(el);
      });
      const cnt = $(`[data-count="${key}"]`);
      if (cnt) cnt.textContent = `${state[key].length}장`;
    }
    const handMax = 14 - parseMelds().length * 3;
    $('[data-count="hand"]').textContent = `${state.hand.length} / ${handMax}장`;
    const doraList = $('[data-dora-list]');
    doraList.textContent = state.dora.length ? '도라: ' + state.dora.map((t) => MJ.tileName(MJ.doraFromIndicator(t.id))).join(', ') : '';
    $$('.zone').forEach((z) => z.classList.toggle('active', z.dataset.target === state.target));
    $$('.threat-select').forEach((s) => {
      s.value = state.threat[s.dataset.threat];
      s.className = `threat-select ${s.value}`;
    });
    $('#roundWind').value = state.roundWind;
    $('#seatWind').value = state.seatWind;
    refreshPalette();
  }

  // ───────── 분석 & 결과 렌더
  let timer = null;
  function update() {
    renderZones();
    saveHash();
    clearTimeout(timer);
    timer = setTimeout(runAnalysis, 30);
  }

  function runAnalysis() {
    results.innerHTML = '';
    if (!state.hand.length) {
      results.appendChild(msg('info', '왼쪽에서 손패를 입력하거나 예제를 불러오세요. 14장(쯔모 후)을 넣으면 각 패를 버렸을 때의 분석을 보여줍니다.'));
      return;
    }
    let meldGroups;
    try {
      meldGroups = state.meldsText.trim() ? state.meldsText.trim().split(/\s+/).map((g) => MJ.parseTiles(g)) : [];
      $('[data-text="melds"]').classList.remove('invalid');
      $('[data-err="melds"]').textContent = '';
    } catch (e) {
      $('[data-text="melds"]').classList.add('invalid');
      $('[data-err="melds"]').textContent = e.message;
      return;
    }

    const t0 = performance.now();
    const res = MJ.analyze({
      hand: state.hand,
      melds: meldGroups,
      doraIndicators: state.dora,
      otherVisible: state.other,
      discards: { self: state.self, shimocha: state.shimocha, toimen: state.toimen, kamicha: state.kamicha },
      threat: state.threat,
      roundWind: state.roundWind,
      seatWind: state.seatWind,
    });
    const ms = Math.round(performance.now() - t0);

    for (const e of res.errors) results.appendChild(msg('error', e));
    for (const w of res.warnings || []) results.appendChild(msg('warn', w));
    if (res.errors.length) return;

    if (res.mode === 'waiting') return renderWaiting(res);
    renderDiscard(res, ms);
  }

  function msg(type, text) {
    const d = document.createElement('div');
    d.className = `msg ${type}`;
    d.textContent = text;
    return d;
  }

  function renderWaiting(res) {
    const box = document.createElement('div');
    box.className = 'panel';
    const s = MJ.shantenText(res.shanten);
    box.innerHTML = `<h2>현재 ${s} <small>— 13장 (쯔모 전)</small></h2>`;
    box.appendChild(msg('info', '쯔모한 패를 손패 마지막에 추가해 14장을 만들면, 어떤 패를 버릴지 추천해 드립니다.'));
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = res.shanten === 0 ? `대기패 ${res.ukeire.kinds}종 ${res.ukeire.total}장` : `유효패 ${res.ukeire.kinds}종 ${res.ukeire.total}장`;
    box.appendChild(sub);
    box.appendChild(ukeList(res.ukeire.tiles));
    if (res.tenpai) {
      if (res.tenpai.furiten) box.appendChild(msg('error', `후리텐: ${res.tenpai.furitenTiles.map((i) => MJ.tileName(i)).join(', ')} 을(를) 버렸기 때문에 론 불가`));
      if (!res.tenpai.canWin) box.appendChild(msg('error', '역 없음 — 후로 상태에서는 화료할 수 없습니다'));
    }
    results.appendChild(box);
  }

  function renderDiscard(res, ms) {
    const top = res.candidates[0];
    // 요약
    const sum = document.createElement('div');
    sum.className = 'summary';
    const bigTile = tileEl(top.tile.id, top.tile.red, 'lg');
    sum.appendChild(bigTile);
    const txt = document.createElement('div');
    const stanceTag = res.opponents.length ? `<span class="stance ${res.stance}">${escapeHtml(res.summary.stanceText.split(' ')[0])}</span>` : '';
    txt.innerHTML = `<div class="big">${escapeHtml(MJ.tileName(top.tile.id, top.tile.red))} 버리기 추천 ${stanceTag}</div>
      <ul>${res.summary.lines.slice(1).map((l) => `<li>${escapeHtml(l)}</li>`).join('')}
      <li>현재 손패: ${MJ.shantenText(res.shanten)} · 분석 ${ms}ms</li></ul>`;
    sum.appendChild(txt);
    results.appendChild(sum);

    if (res.agari) {
      const w = res.win;
      const yaku = w && w.hasYaku ? w.yaku.map((y) => `${y.name}${y.han >= 13 ? '(역만)' : ` ${y.han}판`}`).join(', ') : '역 없음 (멘젠이면 쯔모 1판)';
      results.appendChild(msg('info', `화료형입니다! 역: ${yaku}${w && w.dora ? ` · 도라 ${w.dora}` : ''}`));
    }
    if (res.opponents.length) {
      const names = res.opponents.map((o) => `${o.name}(${o.kind === 'riichi' ? '리치' : '경계'})`).join(', ');
      results.appendChild(msg(res.stance === 'fold' ? 'error' : 'warn', `위협: ${names} → ${res.summary.stanceText}`));
    }

    // 손패 미리보기 (각 패의 순위)
    const rankOf = new Map(res.candidates.map((c) => [`${c.tile.id}-${c.tile.red}`, c]));
    const pv = document.createElement('div');
    pv.className = 'panel';
    pv.innerHTML = '<h2>패별 순위 <small>— 패를 누르면 해당 설명으로 이동</small></h2>';
    const row = document.createElement('div');
    row.className = 'hand-preview';
    MJ.sortTiles(state.hand).forEach((t) => {
      const cand = rankOf.get(`${t.id}-${t.red}`);
      const el = tileEl(t.id, t.red, `clickable${cand.rank === 1 ? ' best' : ''}`);
      const b = document.createElement('span');
      b.className = `badge${cand.rank === 1 ? ' r1' : cand.shanten > res.bestShanten ? ' bad' : ''}`;
      b.textContent = cand.rank;
      el.appendChild(b);
      el.addEventListener('click', () => openCand(cand.rank));
      row.appendChild(el);
    });
    parseMelds().forEach((m) => {
      const gap = document.createElement('span');
      gap.className = 'gap';
      row.appendChild(gap);
      m.forEach((t) => row.appendChild(tileEl(t.id, t.red, 'sm')));
    });
    pv.appendChild(row);
    results.appendChild(pv);

    // 후보 목록
    const scores = res.candidates.map((c) => c.score);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const list = document.createElement('div');
    res.candidates.forEach((c) => list.appendChild(candCard(c, res, (c.score - min) / (max - min || 1))));
    results.appendChild(list);
    const legend = document.createElement('p');
    legend.className = 'help';
    legend.innerHTML = '점수는 샨텐 수 → 유효패 장수 → 다음 단계 형태 → 도라·역 가치 순으로 반영하고, 위협이 있으면 추정 방총률에 비례한 감점을 줍니다. 방총률은 통계적 경향을 단순화한 <b>대략치</b>입니다.';
    results.appendChild(legend);
  }

  function candCard(c, res, ratio) {
    const card = document.createElement('div');
    card.className = `cand${c.rank === 1 ? ' top open' : ''}`;
    card.id = `cand-${c.rank}`;
    const head = document.createElement('div');
    head.className = 'cand-head';
    const rank = document.createElement('div');
    rank.className = 'rank';
    rank.textContent = c.rank;
    head.appendChild(rank);
    head.appendChild(tileEl(c.tile.id, c.tile.red));

    const chips = document.createElement('div');
    chips.className = 'chips';
    const chip = (text, cls = '') => `<span class="chip ${cls}">${escapeHtml(text)}</span>`;
    let html = chip(MJ.shantenText(c.shanten), c.shanten > res.bestShanten ? 'bad' : c.shanten === 0 ? 'good' : '');
    html += chip(c.shanten === 0 ? `대기 ${c.ukeire.kinds}종 ${c.ukeire.total}장` : `유효패 ${c.ukeire.kinds}종 ${c.ukeire.total}장`);
    if (c.quality && c.shanten === 1) html += chip(`텐파이 시 평균 ${c.quality.avg.toFixed(1)}장`);
    if (c.tenpai && c.tenpai.furiten) html += chip('후리텐', 'bad');
    if (c.tenpai && !c.tenpai.canWin) html += chip('역 없음', 'bad');
    if (c.doraLost) html += chip(`도라 -${c.doraLost}`, 'warn');
    if (c.dangers.length) {
      html += c.dangerPct === 0 ? chip('안전(현물)', 'good') : chip(`위험 ~${c.dangerPct}%`, c.dangerPct >= 7 ? 'bad' : 'warn');
    }
    chips.innerHTML = html;
    head.appendChild(chips);
    const bar = document.createElement('div');
    bar.className = 'scorebar';
    bar.innerHTML = `<i style="width:${Math.max(4, Math.round(ratio * 100))}%"></i>`;
    head.appendChild(bar);
    head.addEventListener('click', () => card.classList.toggle('open'));
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'cand-body';
    const ul = document.createElement('ul');
    ul.className = 'reasons';
    for (const r of c.reasons) {
      const li = document.createElement('li');
      li.className = r.type;
      li.textContent = r.text;
      ul.appendChild(li);
    }
    body.appendChild(ul);
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = c.shanten === 0 ? '대기패 (남은 장수)' : '유효패 (남은 장수)';
    body.appendChild(sub);
    body.appendChild(ukeList(c.ukeire.tiles));
    card.appendChild(body);
    return card;
  }

  function ukeList(tiles) {
    const wrap = document.createElement('div');
    wrap.className = 'uke-list';
    for (const t of tiles) {
      const u = document.createElement('span');
      u.className = `uke${t.remaining === 0 ? ' zero' : ''}`;
      u.appendChild(tileEl(t.id, false, 'sm'));
      u.append(`×${t.remaining}`);
      wrap.appendChild(u);
    }
    if (!tiles.length) wrap.textContent = '없음';
    return wrap;
  }

  function openCand(rank) {
    const card = document.getElementById(`cand-${rank}`);
    if (!card) return;
    card.classList.add('open', 'flash');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => card.classList.remove('flash'), 1000);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  let flashTimer = null;
  function flash(text) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'msg warn';
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:50;box-shadow:0 4px 20px rgba(0,0,0,.15)';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (el.style.display = 'none'), 1800);
  }

  // ───────── URL 해시 저장/복원 (링크 공유용)
  const HASH_KEYS = { hand: 'h', self: 'me', shimocha: 'r', toimen: 'a', kamicha: 'l', dora: 'd', other: 'o' };
  function saveHash() {
    const p = new URLSearchParams();
    for (const [k, short] of Object.entries(HASH_KEYS)) if (state[k].length) p.set(short, orderedString(state[k]));
    if (state.meldsText.trim()) p.set('f', state.meldsText.trim());
    const th = SEATS.map((s) => ({ none: '0', riichi: 'r', caution: 'c' }[state.threat[s]])).join('');
    if (th !== '000') p.set('t', th);
    if (state.roundWind) p.set('rw', state.roundWind);
    if (state.seatWind) p.set('sw', state.seatWind);
    const str = p.toString();
    history.replaceState(null, '', str ? `#${str}` : location.pathname + location.search);
  }

  function loadHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    for (const [k, short] of Object.entries(HASH_KEYS)) {
      try { state[k] = p.get(short) ? MJ.parseTiles(p.get(short)) : []; } catch (e) { state[k] = []; }
    }
    state.meldsText = p.get('f') || '';
    const th = p.get('t') || '000';
    SEATS.forEach((s, i) => (state.threat[s] = { r: 'riichi', c: 'caution' }[th[i]] || 'none'));
    state.roundWind = +(p.get('rw') || 0);
    state.seatWind = +(p.get('sw') || 0);
    for (const k of LIST_KEYS) syncText(k);
    $('[data-text="melds"]').value = state.meldsText;
  }

  function loadExample(ex) {
    for (const k of LIST_KEYS) state[k] = ex[k] ? MJ.parseTiles(ex[k]) : [];
    state.meldsText = ex.melds || '';
    state.threat = { shimocha: 'none', toimen: 'none', kamicha: 'none', ...(ex.threat || {}) };
    state.roundWind = 0;
    state.seatWind = 0;
    state.target = 'hand';
    for (const k of LIST_KEYS) syncText(k);
    $('[data-text="melds"]').value = state.meldsText;
    update();
  }

  // ───────── 이벤트
  function bind() {
    $$('.zone').forEach((z) =>
      z.addEventListener('click', () => {
        state.target = z.dataset.target;
        renderZones();
      })
    );
    $$('[data-text]').forEach((input) => {
      const key = input.dataset.text;
      input.addEventListener('focus', () => {
        state.target = key;
        renderZones();
      });
      input.addEventListener('input', () => {
        if (key === 'melds') {
          state.meldsText = input.value;
          return update();
        }
        try {
          state[key] = MJ.parseTiles(input.value);
          input.classList.remove('invalid');
          $(`[data-err="${key}"]`).textContent = '';
          update();
        } catch (e) {
          input.classList.add('invalid');
          $(`[data-err="${key}"]`).textContent = e.message;
        }
      });
    });
    $$('[data-clear]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        state[b.dataset.clear] = [];
        syncText(b.dataset.clear);
        update();
      })
    );
    $('[data-sort]').addEventListener('click', (e) => {
      e.stopPropagation();
      state.hand = MJ.sortTiles(state.hand);
      syncText('hand');
      update();
    });
    $$('.threat-select').forEach((s) => {
      s.addEventListener('click', (e) => e.stopPropagation());
      s.addEventListener('change', () => {
        state.threat[s.dataset.threat] = s.value;
        update();
      });
    });
    $('#roundWind').addEventListener('change', (e) => { state.roundWind = +e.target.value; update(); });
    $('#seatWind').addEventListener('change', (e) => { state.seatWind = +e.target.value; update(); });
    $('#resetAll').addEventListener('click', () => loadExample({}));
    $('#copyLink').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        flash('링크를 복사했습니다');
      } catch (e) {
        flash('주소창의 URL을 복사하세요');
      }
    });

    const exBox = $('#examples');
    for (const ex of EXAMPLES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ex.name;
      b.title = ex.note;
      b.addEventListener('click', () => loadExample(ex));
      exBox.appendChild(b);
    }
  }

  buildPalette();
  bind();
  if (location.hash.length > 1) {
    loadHash();
    update();
  } else {
    loadExample(EXAMPLES[1]);
  }
})();
