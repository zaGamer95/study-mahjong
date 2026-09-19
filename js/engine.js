/*
 * 리치 마작 버림패 분석 엔진
 * - 샨텐 수 계산 (일반형 / 치또이쯔 / 국사무쌍)
 * - 유효패(우케이레) 계산 (보이는 패 제외)
 * - 다음 단계 품질 (1샨텐→텐파이 대기 수, 2샨텐→1샨텐 유효패)
 * - 텐파이 시 대기/역/후리텐 판정
 * - 리치 상대 기준 위험도 추정 (현물/스지/벽/자패)
 *
 * 브라우저에서는 window.MJ, Node 에서는 module.exports 로 노출된다.
 */
(function (global) {
  'use strict';

  // ───────────────────────────── 패 기본 ─────────────────────────────
  // id: 0-8 만(1m-9m), 9-17 통(1p-9p), 18-26 삭(1s-9s), 27-33 자패(동남서북백발중)
  const SUIT_CHARS = ['m', 'p', 's', 'z'];
  const SUIT_KO = ['만', '통', '삭'];
  const HONOR_KO = ['동', '남', '서', '북', '백', '발', '중'];
  const WIND_KO = ['동', '남', '서', '북'];

  const suitOf = (id) => Math.floor(id / 9);
  const numOf = (id) => (id < 27 ? (id % 9) + 1 : id - 26);
  const isHonor = (id) => id >= 27;
  const isTerminal = (id) => id < 27 && (id % 9 === 0 || id % 9 === 8);
  const isYaochu = (id) => isHonor(id) || isTerminal(id);
  const isDragon = (id) => id >= 31;

  function tileCode(id, red) {
    if (red) return '0' + SUIT_CHARS[suitOf(id)];
    return numOf(id) + SUIT_CHARS[suitOf(id)];
  }

  function tileName(id, red) {
    if (isHonor(id)) return HONOR_KO[id - 27];
    return (red ? '적' : '') + numOf(id) + SUIT_KO[suitOf(id)];
  }

  /** "123m0p55z" 형식 문자열 → [{id, red}] */
  function parseTiles(str) {
    const tiles = [];
    let pending = [];
    for (const ch of String(str).replace(/[\s,]+/g, '')) {
      if (ch >= '0' && ch <= '9') {
        pending.push(+ch);
      } else if ('mpsz'.includes(ch)) {
        if (!pending.length) throw new Error(`'${ch}' 앞에 숫자가 없습니다`);
        const s = 'mpsz'.indexOf(ch);
        for (const n of pending) {
          if (s === 3) {
            if (n < 1 || n > 7) throw new Error(`자패는 1z~7z 입니다 (${n}z)`);
            tiles.push({ id: 27 + n - 1, red: false });
          } else if (n === 0) {
            tiles.push({ id: s * 9 + 4, red: true });
          } else {
            tiles.push({ id: s * 9 + n - 1, red: false });
          }
        }
        pending = [];
      } else {
        throw new Error(`알 수 없는 문자 '${ch}'`);
      }
    }
    if (pending.length) throw new Error('숫자 뒤에 m/p/s/z 를 붙여주세요');
    return tiles;
  }

  function sortTiles(tiles) {
    return tiles.slice().sort((a, b) => a.id - b.id || (a.red ? 1 : 0) - (b.red ? 1 : 0));
  }

  /** [{id, red}] → "123m0p55z" (정렬된 표기) */
  function tilesToString(tiles) {
    let out = '';
    for (let s = 0; s < 4; s++) {
      const nums = sortTiles(tiles)
        .filter((t) => suitOf(t.id) === s)
        .map((t) => (t.red ? '0' : String(numOf(t.id))));
      if (nums.length) out += nums.join('') + SUIT_CHARS[s];
    }
    return out;
  }

  function toCounts(tiles) {
    const c = new Array(34).fill(0);
    for (const t of tiles) c[t.id]++;
    return c;
  }

  function doraFromIndicator(id) {
    if (id < 27) return suitOf(id) * 9 + ((id % 9) + 1) % 9;
    if (id <= 30) return 27 + ((id - 27 + 1) % 4);
    return 31 + ((id - 31 + 1) % 3);
  }

  // ───────────────────────────── 샨텐 ─────────────────────────────
  // 각 그룹(만/통/삭/자패)을 (면자 m, 탑쯔 t, 머리 h) 조합으로 분해한 뒤 합친다.
  const GROUPS = [
    [0, 9, true],
    [9, 9, true],
    [18, 9, true],
    [27, 7, false],
  ];
  const groupMemo = new Map();

  function pareto(list) {
    const out = [];
    for (const a of list) {
      let dominated = false;
      for (const b of list) {
        if (a === b) continue;
        if (b[0] >= a[0] && b[1] >= a[1] && b[2] >= a[2] && (b[0] > a[0] || b[1] > a[1] || b[2] > a[2])) {
          dominated = true;
          break;
        }
      }
      if (!dominated && !out.some((o) => o[0] === a[0] && o[1] === a[1] && o[2] === a[2])) out.push(a);
    }
    return out;
  }

  function groupOptions(c, start, len, allowSeq) {
    let key = allowSeq ? 's' : 'h';
    for (let i = 0; i < len; i++) key += c[start + i];
    const cached = groupMemo.get(key);
    if (cached) return cached;

    const a = c.slice(start, start + len);
    const found = new Set();
    (function dfs(i, m, t, h) {
      while (i < len && a[i] === 0) i++;
      if (i === len) {
        found.add(m * 100 + t * 10 + h);
        return;
      }
      if (a[i] >= 3) {
        a[i] -= 3;
        dfs(i, m + 1, t, h);
        a[i] += 3;
      }
      if (allowSeq && i + 2 < len && a[i + 1] && a[i + 2]) {
        a[i]--; a[i + 1]--; a[i + 2]--;
        dfs(i, m + 1, t, h);
        a[i]++; a[i + 1]++; a[i + 2]++;
      }
      if (a[i] >= 2) {
        a[i] -= 2;
        if (!h) dfs(i, m, t, 1);
        dfs(i, m, t + 1, h);
        a[i] += 2;
      }
      if (allowSeq && i + 1 < len && a[i + 1]) {
        a[i]--; a[i + 1]--;
        dfs(i, m, t + 1, h);
        a[i]++; a[i + 1]++;
      }
      if (allowSeq && i + 2 < len && a[i + 2]) {
        a[i]--; a[i + 2]--;
        dfs(i, m, t + 1, h);
        a[i]++; a[i + 2]++;
      }
      a[i]--;
      dfs(i, m, t, h);
      a[i]++;
    })(0, 0, 0, 0);

    const list = pareto([...found].map((v) => [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10]));
    groupMemo.set(key, list);
    return list;
  }

  function shantenRegular(c, melds) {
    let states = [[melds, 0, 0]];
    for (const [start, len, seq] of GROUPS) {
      const opts = groupOptions(c, start, len, seq);
      const next = [];
      for (const s of states) {
        for (const o of opts) {
          if (s[2] && o[2]) continue;
          next.push([s[0] + o[0], Math.min(s[1] + o[1], 8), s[2] | o[2]]);
        }
      }
      states = pareto(next);
    }
    let best = 8;
    for (const [m, t, h] of states) {
      const tt = Math.max(0, Math.min(t, 4 - m));
      best = Math.min(best, 8 - 2 * m - tt - h);
    }
    return best;
  }

  function shantenChiitoi(c) {
    let pairs = 0;
    let kinds = 0;
    for (let i = 0; i < 34; i++) {
      if (c[i] >= 1) kinds++;
      if (c[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  const YAOCHU_IDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  function shantenKokushi(c) {
    let kinds = 0;
    let pair = false;
    for (const i of YAOCHU_IDS) {
      if (c[i] >= 1) kinds++;
      if (c[i] >= 2) pair = true;
    }
    return 13 - kinds - (pair ? 1 : 0);
  }

  const shantenMemo = new Map();
  /** 손패 카운트(후로 제외)와 후로 수 → 샨텐 (-1 = 화료) */
  function calcShanten(c, melds = 0) {
    const key = c.join('') + melds;
    const cached = shantenMemo.get(key);
    if (cached !== undefined) return cached;
    let s = shantenRegular(c, melds);
    if (melds === 0) s = Math.min(s, shantenChiitoi(c), shantenKokushi(c));
    if (shantenMemo.size > 300000) shantenMemo.clear();
    shantenMemo.set(key, s);
    return s;
  }

  function shantenDetail(c, melds = 0) {
    return {
      total: calcShanten(c, melds),
      regular: shantenRegular(c, melds),
      chiitoi: melds === 0 ? shantenChiitoi(c) : null,
      kokushi: melds === 0 ? shantenKokushi(c) : null,
    };
  }

  // ───────────────────────────── 유효패 ─────────────────────────────
  /**
   * 3n+1 장 손패 기준 유효패.
   * seen[t] = 손패 외에 보이는 장수 (버림패, 도라표시패, 후로 등)
   */
  function ukeire(c, melds, seen, base) {
    if (base === undefined) base = calcShanten(c, melds);
    const tiles = [];
    let total = 0;
    for (let t = 0; t < 34; t++) {
      if (c[t] >= 4) continue;
      c[t]++;
      const s = calcShanten(c, melds);
      c[t]--;
      if (s < base) {
        const remaining = Math.max(0, 4 - c[t] - (seen ? seen[t] : 0));
        tiles.push({ id: t, remaining });
        total += remaining;
      }
    }
    return { tiles, kinds: tiles.length, total };
  }

  /**
   * 다음 단계 품질: 유효패를 뽑았을 때 최선의 타패 후 유효패 장수의 가중 평균.
   * 1샨텐이면 "텐파이 시 평균 대기 장수" + "2종 이상 대기 확률"이 된다.
   */
  function nextStepQuality(c, melds, seen, shanten, uke) {
    let weight = 0;
    let sum = 0;
    let good = 0;
    for (const { id: t, remaining } of uke.tiles) {
      if (remaining <= 0) continue;
      c[t]++;
      const seen2 = seen.slice();
      let best = 0;
      let bestKinds = 0;
      for (let d = 0; d < 34; d++) {
        if (!c[d]) continue;
        c[d]--;
        if (calcShanten(c, melds) === shanten - 1) {
          seen2[d]++;
          const u = ukeire(c, melds, seen2, shanten - 1);
          seen2[d]--;
          if (u.total > best || (u.total === best && u.kinds > bestKinds)) {
            best = u.total;
            bestKinds = u.kinds;
          }
        }
        c[d]++;
      }
      c[t]--;
      weight += remaining;
      sum += remaining * best;
      if (bestKinds >= 2) good += remaining;
    }
    if (!weight) return { avg: 0, goodRate: 0 };
    return { avg: sum / weight, goodRate: good / weight };
  }

  // ───────────────────────────── 화료형 / 역 ─────────────────────────────
  function decompose(c) {
    // 3n+2 장 → [{head, sets:[{type:'seq'|'tri', id}]}]
    const results = [];
    const sets = [];
    function rec(start) {
      let i = start;
      while (i < 34 && c[i] === 0) i++;
      if (i === 34) {
        results.push(sets.slice());
        return;
      }
      if (c[i] >= 3) {
        c[i] -= 3;
        sets.push({ type: 'tri', id: i });
        rec(i);
        sets.pop();
        c[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        sets.push({ type: 'seq', id: i });
        rec(i);
        sets.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
    }
    const out = [];
    for (let h = 0; h < 34; h++) {
      if (c[h] < 2) continue;
      c[h] -= 2;
      results.length = 0;
      rec(0);
      for (const r of results) out.push({ head: h, sets: r });
      c[h] += 2;
    }
    return out;
  }

  function parseMeld(tiles) {
    const ids = tiles.map((t) => t.id).sort((a, b) => a - b);
    if (ids.length === 4 && ids.every((x) => x === ids[0])) return { type: 'tri', id: ids[0], kan: true, tiles };
    if (ids.length !== 3) return null;
    if (ids[0] === ids[1] && ids[1] === ids[2]) return { type: 'tri', id: ids[0], tiles };
    if (ids[0] < 27 && suitOf(ids[0]) === suitOf(ids[2]) && ids[1] === ids[0] + 1 && ids[2] === ids[0] + 2) {
      return { type: 'seq', id: ids[0], tiles };
    }
    return null;
  }

  const WAIT_RANK = { ryanmen: 5, shanpon: 3, kanchan: 2, penchan: 2, tanki: 2, kokushi13: 5, kokushi: 2 };
  const WAIT_KO = {
    ryanmen: '양면',
    shanpon: '샤보(쌍퐁)',
    kanchan: '간짱',
    penchan: '변짱',
    tanki: '단기',
    kokushi: '국사 단기',
    kokushi13: '국사 13면',
  };

  function waitShapeOf(dec, win) {
    let best = null;
    const consider = (w) => {
      if (!best || WAIT_RANK[w] > WAIT_RANK[best]) best = w;
    };
    if (dec.head === win) consider('tanki');
    for (const s of dec.sets) {
      if (s.type === 'tri' && s.id === win) consider('shanpon');
      if (s.type === 'seq' && win >= s.id && win <= s.id + 2) {
        const n = numOf(s.id);
        if (win === s.id + 1) consider('kanchan');
        else if (win === s.id) consider(n === 7 ? 'penchan' : 'ryanmen');
        else consider(n === 1 ? 'penchan' : 'ryanmen');
      }
    }
    return best;
  }

  /**
   * 화료 평가 (론 기준). closed: 손패 카운트(화료패 포함), melds: parseMeld 결과
   * ctx: {seatWind, roundWind, doraIds:[], redCount}
   */
  function evaluateWin(closed, melds, win, ctx) {
    const isClosed = melds.length === 0;
    const yakuhaiIds = new Set([31, 32, 33, 27 + ctx.seatWind, 27 + ctx.roundWind]);
    const all = closed.slice();
    for (const m of melds) {
      if (m.type === 'tri') all[m.id] += 3;
      else { all[m.id]++; all[m.id + 1]++; all[m.id + 2]++; }
    }
    let dora = ctx.redCount || 0;
    for (const d of ctx.doraIds) dora += all[d] + melds.filter((m) => m.kan && m.id === d).length;

    const used = [];
    for (let i = 0; i < 34; i++) if (all[i]) used.push(i);
    const suits = new Set(used.filter((i) => i < 27).map(suitOf));
    const hasHonor = used.some(isHonor);
    const onlyYaochu = used.every(isYaochu);

    const flatYaku = [];
    if (used.every((i) => !isYaochu(i))) flatYaku.push(['탕야오', 1]);
    if (suits.size === 1 && !hasHonor) flatYaku.push(['청일색', isClosed ? 6 : 5]);
    else if (suits.size === 1 && hasHonor) flatYaku.push(['혼일색', isClosed ? 3 : 2]);
    if (used.every(isHonor)) flatYaku.push(['자일색', 13]);

    const candidates = [];

    // 국사무쌍
    if (isClosed && shantenKokushi(closed) === -1) {
      const thirteen = closed[win] === 2;
      candidates.push({ yaku: [[thirteen ? '국사무쌍 13면' : '국사무쌍', 13]], wait: thirteen ? 'kokushi13' : 'kokushi' });
    }

    // 치또이쯔
    if (isClosed && shantenChiitoi(closed) === -1 && shantenRegular(closed, 0) !== -1) {
      const y = [['치또이쯔', 2], ...flatYaku.filter(([n]) => n !== '자일색')];
      if (onlyYaochu && hasHonor && used.some((i) => !isHonor(i))) y.push(['혼노두', 2]);
      if (used.every(isHonor)) y.push(['자일색', 13]);
      candidates.push({ yaku: y, wait: 'tanki' });
    }

    // 일반형
    for (const dec of decompose(closed.slice())) {
      const handSets = dec.sets;
      const sets = [...handSets, ...melds.map((m) => ({ type: m.type, id: m.id, open: true }))];
      const seqs = sets.filter((s) => s.type === 'seq');
      const tris = sets.filter((s) => s.type === 'tri');
      const wait = waitShapeOf(dec, win);
      const y = flatYaku.slice();

      // 역패
      for (const t of tris) {
        if (isDragon(t.id)) y.push([`역패 ${HONOR_KO[t.id - 27]}`, 1]);
        if (t.id === 27 + ctx.seatWind) y.push([`자풍 ${WIND_KO[ctx.seatWind]}`, 1]);
        if (t.id === 27 + ctx.roundWind) y.push([`장풍 ${WIND_KO[ctx.roundWind]}`, 1]);
      }
      // 핑후
      if (isClosed && seqs.length === 4 && !yakuhaiIds.has(dec.head) && wait === 'ryanmen') {
        const ryanmenPossible = handSets.some((s) => {
          if (s.type !== 'seq') return false;
          if (win === s.id) return numOf(s.id) <= 6;
          if (win === s.id + 2) return numOf(s.id) >= 2;
          return false;
        });
        if (ryanmenPossible) y.push(['핑후', 1]);
      }
      // 이페코 / 량페코
      if (isClosed) {
        const cnt = {};
        for (const s of handSets) if (s.type === 'seq') cnt[s.id] = (cnt[s.id] || 0) + 1;
        const peiko = Object.values(cnt).reduce((a, v) => a + Math.floor(v / 2), 0);
        if (peiko === 2) y.push(['량페코', 3]);
        else if (peiko === 1) y.push(['이페코', 1]);
      }
      // 삼색동순
      for (let n = 0; n < 7; n++) {
        if ([0, 1, 2].every((s) => seqs.some((q) => q.id === s * 9 + n))) {
          y.push(['삼색동순', isClosed ? 2 : 1]);
          break;
        }
      }
      // 삼색동각
      for (let n = 0; n < 9; n++) {
        if ([0, 1, 2].every((s) => tris.some((q) => q.id === s * 9 + n))) {
          y.push(['삼색동각', 2]);
          break;
        }
      }
      // 일기통관
      for (let s = 0; s < 3; s++) {
        if ([0, 3, 6].every((n) => seqs.some((q) => q.id === s * 9 + n))) {
          y.push(['일기통관', isClosed ? 2 : 1]);
          break;
        }
      }
      // 또이또이 / 산안커
      if (tris.length === 4) y.push(['또이또이', 2]);
      const concealed = handSets.filter((s) => {
        if (s.type !== 'tri') return false;
        if (s.id !== win) return true;
        // 론으로 완성된 커쯔는 밍커 취급 (단, 슌쯔로도 해석 가능한 경우 제외)
        return handSets.some((q) => q.type === 'seq' && win >= q.id && win <= q.id + 2);
      }).length;
      if (concealed === 4) y.push(['스안커', 13]);
      else if (concealed === 3) y.push(['산안커', 2]);
      // 찬타 / 준찬타 / 혼노두
      const setHasYaochu = (s) => (s.type === 'tri' ? isYaochu(s.id) : numOf(s.id) === 1 || numOf(s.id) === 7);
      if (seqs.length && isYaochu(dec.head) && sets.every(setHasYaochu)) {
        if (hasHonor) y.push(['찬타', isClosed ? 2 : 1]);
        else y.push(['준찬타', isClosed ? 3 : 2]);
      }
      if (!seqs.length && onlyYaochu) {
        if (hasHonor && used.some((i) => !isHonor(i))) y.push(['혼노두', 2]);
        if (!hasHonor) y.push(['청노두', 13]);
      }
      // 삼원패
      const dragonTris = tris.filter((t) => isDragon(t.id)).length;
      if (dragonTris === 3) y.push(['대삼원', 13]);
      else if (dragonTris === 2 && isDragon(dec.head)) y.push(['소삼원', 2]);
      // 사희
      const windTris = tris.filter((t) => t.id >= 27 && t.id <= 30).length;
      if (windTris === 4) y.push(['대사희', 13]);
      else if (windTris === 3 && dec.head >= 27 && dec.head <= 30) y.push(['소사희', 13]);

      candidates.push({ yaku: y, wait });
    }

    let best = null;
    for (const cand of candidates) {
      const yakuman = cand.yaku.filter(([, h]) => h >= 13);
      const yaku = yakuman.length ? yakuman : cand.yaku;
      const han = yaku.reduce((a, [, h]) => a + h, 0);
      const score = (yakuman.length ? 100 : 0) + han;
      if (!best || score > best.score || (score === best.score && WAIT_RANK[cand.wait] > WAIT_RANK[best.wait])) {
        best = { score, han, yaku, yakuman: yakuman.length > 0, wait: cand.wait };
      }
    }
    if (!best) return null;
    return {
      han: best.han,
      yaku: best.yaku.map(([name, han]) => ({ name, han })),
      yakuman: best.yakuman,
      hasYaku: best.yaku.length > 0,
      dora,
      wait: best.wait,
    };
  }

  // ───────────────────────────── 위험도 ─────────────────────────────
  // 리치 상대 기준 대략적인 방총률(%) — 통계 연구에서 흔히 인용되는 수치를 단순화
  const DANGER = {
    musuji: { 1: 5.5, 2: 7.5, 3: 9, 4: 12, 5: 12.5, 6: 12, 7: 9, 8: 7.5, 9: 5.5 },
    suji: { 1: 1.8, 2: 2.8, 3: 4.5, 7: 4.5, 8: 2.8, 9: 1.8 },
    nakasuji: 3.5,
    halfSuji: 7.5,
    honor: [0, 1, 3, 7], // index = 남은 미확인 장수
  };

  /**
   * id: 버릴 패, oppDiscards: 상대 버림패 id 배열, unseen: 나에게서 보이지 않는 장수 배열
   */
  function dangerAgainst(id, oppDiscards, unseen) {
    const disc = new Set(oppDiscards);
    if (disc.has(id)) return { pct: 0, label: '현물', level: 'safe' };

    if (isHonor(id)) {
      const u = Math.max(0, Math.min(3, unseen[id]));
      const pct = DANGER.honor[u];
      const label = u === 0 ? '자패 (4장 다 보임)' : u === 1 ? '자패 (3장 보임, 단기만)' : u === 2 ? '자패 (2장 보임)' : '생패 자패';
      return { pct, label, level: pct <= 3 ? 'low' : 'mid' };
    }

    const n = numOf(id);
    let pct;
    let label;
    if (n <= 3 || n >= 7) {
      const sujiTile = n <= 3 ? id + 3 : id - 3;
      if (disc.has(sujiTile)) {
        pct = DANGER.suji[n];
        label = `스지 (${tileName(sujiTile)} 버림)`;
      } else {
        pct = DANGER.musuji[n];
        label = '무스지';
      }
    } else {
      const lo = disc.has(id - 3);
      const hi = disc.has(id + 3);
      if (lo && hi) {
        pct = DANGER.nakasuji;
        label = `중스지 (${tileName(id - 3)}·${tileName(id + 3)} 버림)`;
      } else if (lo || hi) {
        pct = DANGER.halfSuji;
        label = `반스지 (${tileName(lo ? id - 3 : id + 3)}만 버림)`;
      } else {
        pct = DANGER.musuji[n];
        label = '무스지 중장패(4~6)';
      }
    }

    // 벽(카베): 이 패를 기다리는 양면/변짱 형태가 불가능하면 위험도 하락
    const shapes = [];
    if (n <= 7) shapes.push([id + 1, id + 2]);
    if (n >= 3) shapes.push([id - 2, id - 1]);
    const blocked = (shape) => shape.some((x) => unseen[x] <= 0);
    const oneChance = (shape) => shape.some((x) => unseen[x] === 1);
    if (shapes.length && shapes.every(blocked)) {
      if (pct > 3) {
        pct = 3;
        label += ' + 노찬스(벽)';
      }
    } else if (shapes.length && shapes.every((s) => blocked(s) || oneChance(s))) {
      pct = Math.round(pct * 0.7 * 10) / 10;
      label += ' + 원찬스';
    }
    return { pct, label, level: pct <= 3 ? 'low' : pct <= 7 ? 'mid' : 'high' };
  }

  // ───────────────────────────── 손패 내 역할 ─────────────────────────────
  function tileRole(c, id) {
    if (c[id] >= 3) return { key: 'triplet', text: '커쯔(몸통)' };
    if (!isHonor(id)) {
      const n = numOf(id);
      const has = (d) => {
        const m = n + d;
        return m >= 1 && m <= 9 && c[id + d] > 0;
      };
      if ((has(-2) && has(-1)) || (has(-1) && has(1)) || (has(1) && has(2))) {
        return { key: 'sequence', text: '슌쯔(몸통)의 일부' };
      }
      if (c[id] === 2) return { key: 'pair', text: '또이쯔(머리 후보)' };
      if (has(-1) || has(1)) {
        const edge = (n === 1 && has(1)) || (n === 9 && has(-1)) || (n === 2 && has(-1)) || (n === 8 && has(1));
        return { key: 'taatsu', text: edge ? '변짱 탑쯔' : '양면 탑쯔' };
      }
      if (has(-2) || has(2)) return { key: 'kanchan', text: '간짱 탑쯔' };
      return { key: 'isolated', text: '고립패' };
    }
    if (c[id] === 2) return { key: 'pair', text: '또이쯔(머리 후보)' };
    return { key: 'isolated', text: '고립 자패' };
  }

  // ───────────────────────────── 종합 분석 ─────────────────────────────
  const SEATS = ['shimocha', 'toimen', 'kamicha'];
  const SEAT_KO = { shimocha: '하가', toimen: '대가', kamicha: '상가' };

  function shantenText(s) {
    if (s < 0) return '화료';
    if (s === 0) return '텐파이';
    return `${s}샨텐`;
  }

  /**
   * input = {
   *   hand: [{id, red}], melds: [[{id,red}...]], doraIndicators: [{id,red}],
   *   discards: {self, shimocha, toimen, kamicha}: [{id,red}],
   *   otherVisible: [{id,red}],             // 상대 후로 등 기타 공개패
   *   threat: {shimocha, toimen, kamicha}: 'none' | 'riichi' | 'caution',
   *   roundWind: 0-3, seatWind: 0-3
   * }
   */
  function analyze(input) {
    const hand = input.hand || [];
    const meldTiles = input.melds || [];
    const discards = input.discards || {};
    const threat = input.threat || {};
    const ctx = { seatWind: input.seatWind || 0, roundWind: input.roundWind || 0 };
    const errors = [];
    const warnings = [];

    const melds = [];
    for (const m of meldTiles) {
      const pm = parseMeld(m);
      if (!pm) errors.push(`후로 "${tilesToString(m)}" 는 올바른 면자가 아닙니다 (슌쯔/커쯔/깡)`);
      else melds.push(pm);
    }

    const c = toCounts(hand);
    const seen = new Array(34).fill(0); // 손패 외에 보이는 패
    const addSeen = (list) => list.forEach((t) => seen[t.id]++);
    addSeen(input.doraIndicators || []);
    addSeen(input.otherVisible || []);
    meldTiles.forEach(addSeen);
    for (const k of ['self', ...SEATS]) addSeen(discards[k] || []);

    for (let i = 0; i < 34; i++) {
      if (c[i] + seen[i] > 4) errors.push(`${tileName(i)} 이(가) ${c[i] + seen[i]}장 입력되었습니다 (최대 4장)`);
    }
    const redIds = [4, 13, 22];
    for (const r of redIds) {
      const reds = [...hand, ...meldTiles.flat(), ...(input.doraIndicators || [])].filter((t) => t.id === r && t.red).length;
      if (reds > 1) warnings.push(`적${tileName(r)} 이(가) 여러 장입니다 (보통 1장)`);
    }

    const size = hand.length + melds.length * 3;
    const result = { errors, warnings, handSize: hand.length, meldCount: melds.length };
    if (errors.length) return result;
    if (size !== 14 && size !== 13) {
      errors.push(`손패는 후로 포함 13장(쯔모 전) 또는 14장(쯔모 후)이어야 합니다. 현재 ${hand.length}장 + 후로 ${melds.length}개`);
      return result;
    }

    const doraIds = (input.doraIndicators || []).map((t) => doraFromIndicator(t.id));
    result.doraIds = doraIds;
    const selfDiscardIds = new Set((discards.self || []).map((t) => t.id));

    // ── 13장: 현재 상태만 보고
    if (size === 13) {
      const s = calcShanten(c, melds.length);
      const u = ukeire(c, melds.length, seen, s);
      result.mode = 'waiting';
      result.shanten = s;
      result.ukeire = u;
      if (s === 0) result.tenpai = tenpaiInfo(c, melds, u, doraIds, hand, meldTiles, ctx, selfDiscardIds, null);
      return result;
    }

    // ── 14장: 버림패별 분석
    result.mode = 'discard';
    const currentShanten = calcShanten(c, melds.length);
    result.shanten = currentShanten;
    if (currentShanten === -1) {
      result.agari = true;
      const last = hand[hand.length - 1];
      const cc = c.slice();
      result.win = evaluateWin(cc, melds, last.id, { ...ctx, doraIds, redCount: countRed(hand, meldTiles) });
    }

    // 위험 상대 & 보이지 않는 장수(내 손패 포함)
    const opponents = SEATS.filter((k) => threat[k] === 'riichi' || threat[k] === 'caution').map((k) => ({
      key: k,
      name: SEAT_KO[k],
      kind: threat[k],
      discards: (discards[k] || []).map((t) => t.id),
    }));
    const unseen = new Array(34);
    for (let i = 0; i < 34; i++) unseen[i] = 4 - c[i] - seen[i];

    // 후보 목록 (같은 패 + 적 여부로 구분)
    const uniq = [];
    for (const t of sortTiles(hand)) {
      if (!uniq.some((u) => u.id === t.id && u.red === t.red)) uniq.push(t);
    }

    const candidates = uniq.map((tile) => {
      const cc = c.slice();
      cc[tile.id]--;
      const seenAfter = seen.slice();
      seenAfter[tile.id]++; // 버린 패도 보이는 패가 된다
      const s = calcShanten(cc, melds.length);
      const u = ukeire(cc, melds.length, seenAfter, s);
      const handAfter = removeOne(hand, tile);
      const cand = {
        tile,
        shanten: s,
        ukeire: u,
        role: tileRole(c, tile.id),
        doraLost: doraIds.filter((d) => d === tile.id).length + (tile.red ? 1 : 0),
        doraKept: countDora(handAfter, meldTiles, doraIds),
      };
      if (s >= 1 && s <= 2) cand.quality = nextStepQuality(cc, melds.length, seenAfter, s, u);
      if (s === 0) cand.tenpai = tenpaiInfo(cc, melds, u, doraIds, handAfter, meldTiles, ctx, selfDiscardIds, tile.id);
      cand.dangers = opponents.map((o) => ({ ...o, ...dangerAgainst(tile.id, o.discards, unseen) }));
      let safe = 1;
      for (const d of cand.dangers) safe *= 1 - (d.pct / 100) * (d.kind === 'riichi' ? 1 : 0.4);
      cand.dangerPct = Math.round((1 - safe) * 1000) / 10;
      return cand;
    });

    const bestShanten = Math.min(...candidates.map((x) => x.shanten));
    const bestUkeireAt = (s) => Math.max(...candidates.filter((x) => x.shanten === s).map((x) => x.ukeire.total));
    const hasRiichi = opponents.some((o) => o.kind === 'riichi');
    const hasThreat = opponents.length > 0;

    // 공격/수비 가중치: 현재 도달 가능한 최선 샨텐 기준
    let dangerWeight = 0;
    let stance = 'attack';
    if (hasThreat) {
      const bestTenpai = candidates.filter((x) => x.shanten === 0 && x.tenpai && x.tenpai.canWin);
      const goodTenpai = bestTenpai.some((x) => x.ukeire.total >= 5 || x.tenpai.maxHan >= 3);
      if (bestShanten <= 0) {
        dangerWeight = goodTenpai ? 60 : 250;
        stance = goodTenpai ? 'push' : 'careful';
      } else if (bestShanten === 1) {
        dangerWeight = 1100;
        stance = 'careful';
      } else {
        dangerWeight = 4000;
        stance = 'fold';
      }
      if (!hasRiichi) dangerWeight *= 0.35;
    }
    result.stance = hasThreat ? stance : 'attack';
    result.bestShanten = bestShanten;
    result.opponents = opponents.map(({ key, name, kind }) => ({ key, name, kind }));

    for (const cand of candidates) {
      let score = -cand.shanten * 10000 + cand.ukeire.total * 100;
      if (cand.quality) score += cand.quality.avg * (cand.shanten === 1 ? 60 : 12);
      score += cand.doraKept * 140;
      // 역패/자풍 가치
      const yakuhai = [31, 32, 33, 27 + ctx.seatWind, 27 + ctx.roundWind];
      if (isHonor(cand.tile.id)) {
        if (yakuhai.includes(cand.tile.id)) score -= c[cand.tile.id] >= 2 ? 250 : 40;
        const unseenOthers = unseen[cand.tile.id];
        if (!yakuhai.includes(cand.tile.id) && c[cand.tile.id] === 1) score += 20; // 객풍 우선 정리
        if (c[cand.tile.id] === 1 && unseenOthers <= 1) score += 15; // 이미 나온 자패는 쓸모 적음
      } else if (isTerminal(cand.tile.id) && cand.role.key === 'isolated') {
        score += 10;
      }
      if (cand.tenpai) {
        const tp = cand.tenpai;
        if (!tp.canWin) score -= 6000;
        if (tp.furiten) score -= 2500;
        score += tp.maxHan * 120;
      }
      cand.offense = score;
      cand.penalty = cand.dangerPct * dangerWeight;
      cand.score = score - cand.penalty;
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];
    for (const cand of candidates) cand.reasons = explain(cand, { top, bestShanten, bestUkeireAt, c, ctx, unseen, hasThreat, stance: result.stance });
    candidates.forEach((cand, i) => (cand.rank = i + 1));
    result.candidates = candidates;
    result.summary = summarize(result, top);
    return result;
  }

  function countRed(hand, meldTiles) {
    return [...hand, ...meldTiles.flat()].filter((t) => t.red).length;
  }

  function countDora(hand, meldTiles, doraIds) {
    let n = 0;
    for (const t of [...hand, ...meldTiles.flat()]) {
      if (t.red) n++;
      for (const d of doraIds) if (d === t.id) n++;
    }
    return n;
  }

  function removeOne(list, tile) {
    const out = list.slice();
    const i = out.findIndex((t) => t.id === tile.id && t.red === tile.red);
    if (i >= 0) out.splice(i, 1);
    return out;
  }

  function tenpaiInfo(c, melds, u, doraIds, hand, meldTiles, ctx, selfDiscardIds, discarded) {
    const redCount = countRed(hand, meldTiles);
    const isClosed = melds.length === 0;
    const waits = u.tiles.map(({ id, remaining }) => {
      const cc = c.slice();
      cc[id]++;
      const win = evaluateWin(cc, melds, id, { ...ctx, doraIds, redCount });
      return { id, remaining, win };
    });
    const furitenTiles = waits.filter((w) => selfDiscardIds.has(w.id) || w.id === discarded).map((w) => w.id);
    const withYaku = waits.filter((w) => w.win && w.win.hasYaku);
    const canWin = isClosed || withYaku.length > 0;
    const maxHan = Math.max(0, ...waits.map((w) => (w.win && w.win.hasYaku ? w.win.han + w.win.dora : 0)));
    const shapes = [...new Set(waits.map((w) => w.win && w.win.wait).filter(Boolean))];
    return {
      waits,
      furiten: furitenTiles.length > 0,
      furitenTiles,
      isClosed,
      canWin,
      damaOk: withYaku.length > 0,
      partialYaku: withYaku.length > 0 && withYaku.length < waits.length,
      maxHan,
      shapes,
    };
  }

  // ───────────────────────────── 설명 생성 ─────────────────────────────
  function tn(id) {
    return tileName(id);
  }

  function explain(cand, g) {
    const r = []; // {type:'good'|'bad'|'info'|'warn', text}
    const { top, bestShanten, bestUkeireAt, c, ctx } = g;
    const s = cand.shanten;

    // 1. 샨텐 / 유효패
    if (s > bestShanten) {
      r.push({ type: 'bad', text: `샨텐 후퇴: ${shantenText(bestShanten)}을 유지할 수 있는데 ${shantenText(s)}이 됩니다` });
    } else {
      r.push({ type: 'good', text: `버린 뒤 ${shantenText(s)} 유지` });
    }
    if (s === 0) {
      const waitStr = cand.ukeire.tiles.map((t) => `${tn(t.id)}(${t.remaining})`).join(' ');
      r.push({ type: cand.ukeire.total >= 5 ? 'good' : 'info', text: `대기: ${waitStr} → 남은 ${cand.ukeire.total}장` });
    } else {
      r.push({ type: 'info', text: `유효패 ${cand.ukeire.kinds}종 ${cand.ukeire.total}장` });
      const best = bestUkeireAt(s);
      if (s === bestShanten && cand.ukeire.total < best) {
        r.push({ type: 'bad', text: `같은 샨텐의 최선 선택보다 유효패가 ${best - cand.ukeire.total}장 적습니다` });
      } else if (s === bestShanten && cand.ukeire.total === best) {
        r.push({ type: 'good', text: '유효패 장수 최대' });
      }
    }

    // 2. 다음 단계 품질
    if (cand.quality) {
      if (s === 1) {
        const gr = Math.round(cand.quality.goodRate * 100);
        r.push({
          type: cand.quality.avg >= 6 ? 'good' : 'info',
          text: `텐파이하면 평균 ${cand.quality.avg.toFixed(1)}장 대기, 2종 이상(양면급) 대기 확률 ${gr}%`,
        });
      } else if (s === 2) {
        r.push({ type: 'info', text: `1샨텐 도달 시 평균 유효패 ${cand.quality.avg.toFixed(1)}장` });
      }
    }

    // 3. 이 패의 역할
    const role = cand.role;
    const roleType = { isolated: 'good', triplet: 'bad', sequence: 'bad', pair: 'info', taatsu: 'info', kanchan: 'info' }[role.key];
    let roleText = `이 패는 현재 ${role.text}`;
    if (role.key === 'isolated') roleText += ' → 버려도 형태 손실이 거의 없음';
    if (role.key === 'sequence' || role.key === 'triplet') roleText += ' → 완성된 몸통을 깨는 선택';
    r.push({ type: roleType, text: roleText });

    // 4. 자패 / 가치
    const id = cand.tile.id;
    if (isHonor(id)) {
      const yakuhai = isDragon(id) || id === 27 + ctx.seatWind || id === 27 + ctx.roundWind;
      if (yakuhai && c[id] >= 2) r.push({ type: 'bad', text: `역패 ${tn(id)} 또이쯔를 해체합니다 (퐁/커쯔 시 1판)` });
      else if (yakuhai) r.push({ type: 'info', text: `역패 ${tn(id)} — 겹치면 역이 되므로 객풍패보다 늦게 버리는 것이 기본` });
      else if (c[id] === 1) r.push({ type: 'good', text: `객풍패 ${tn(id)} — 역이 되지 않아 가치가 가장 낮은 패` });
      if (c[id] === 1 && g.unseen[id] <= 1) r.push({ type: 'good', text: `${tn(id)} 은(는) 이미 ${4 - g.unseen[id] - 1}장 나와서 또이쯔가 되기 어렵습니다` });
    }
    if (cand.doraLost > 0) {
      r.push({ type: 'bad', text: `도라를 버립니다 (${cand.tile.red ? '적도라 ' : ''}타점 -${cand.doraLost}판)` });
    }

    // 5. 텐파이 세부
    if (cand.tenpai) {
      const tp = cand.tenpai;
      if (tp.shapes.length) r.push({ type: 'info', text: `대기 형태: ${tp.shapes.map((w) => WAIT_KO[w] || w).join(', ')}` });
      if (tp.furiten) {
        r.push({ type: 'bad', text: `후리텐! ${tp.furitenTiles.map(tn).join(', ')} 을(를) 이미 버려서 론 불가 (쯔모만 가능)` });
      }
      if (!tp.isClosed && !tp.damaOk) r.push({ type: 'bad', text: '역 없음 — 후로 상태라 화료할 수 없습니다 (형식 텐파이만 가능)' });
      else if (!tp.isClosed && tp.partialYaku) r.push({ type: 'warn', text: '일부 대기패로만 역이 성립합니다 (카타아가리)' });
      const sample = tp.waits.find((w) => w.win && w.win.hasYaku);
      if (sample) {
        const names = sample.win.yaku.map((y) => (y.han >= 13 ? `${y.name}(역만)` : `${y.name} ${y.han}판`)).join(', ');
        const doraTxt = sample.win.dora ? ` + 도라 ${sample.win.dora}` : '';
        r.push({ type: 'good', text: `${tn(sample.id)} 론 시 역: ${names}${doraTxt}` });
      }
      if (tp.isClosed) {
        r.push({ type: 'info', text: tp.damaOk ? '역이 있어 다마텐도 가능, 리치 시 +1판' : '역 없음 → 리치를 걸어야 화료 가능' });
      }
    }

    // 6. 수비
    for (const d of cand.dangers) {
      const who = `${d.name}${d.kind === 'riichi' ? ' 리치' : ' 경계'}`;
      const type = d.pct === 0 ? 'good' : d.level === 'low' ? 'info' : d.level === 'mid' ? 'warn' : 'bad';
      r.push({ type, text: `${who} 기준: ${d.label}${d.pct === 0 ? ' — 절대 안전' : ` (추정 방총률 약 ${d.pct}%)`}` });
    }

    // 7. 1위와 비교
    if (cand !== top) {
      const diffs = [];
      if (cand.shanten > top.shanten) diffs.push('샨텐이 느림');
      else if (cand.shanten === top.shanten && cand.ukeire.total < top.ukeire.total) diffs.push(`유효패 ${top.ukeire.total - cand.ukeire.total}장 적음`);
      if (cand.dangerPct > top.dangerPct + 0.5) diffs.push(`방총 위험 ${cand.dangerPct}% vs ${top.dangerPct}%`);
      if (cand.doraKept < top.doraKept) diffs.push('도라 손실');
      if (!diffs.length && cand.quality && top.quality && cand.quality.avg < top.quality.avg) diffs.push('다음 단계 형태가 조금 나쁨');
      if (!diffs.length) diffs.push('근소한 차이 (사실상 동급)');
      r.push({ type: 'compare', text: `1위(${tileName(top.tile.id, top.tile.red)}) 대비: ${diffs.join(', ')}` });
    }
    return r;
  }

  function summarize(result, top) {
    const tName = tileName(top.tile.id, top.tile.red);
    const lines = [];
    const stanceText = {
      attack: '공격',
      push: '밀기 (텐파이 유지하며 승부)',
      careful: '신중하게 (안전한 패로 공격 유지, 위험패는 접기 고려)',
      fold: '베타오리 (공격 포기, 안전패 우선)',
    }[result.stance];
    if (result.agari) lines.push('이미 화료형입니다! 쯔모 화료를 선언하세요.');
    lines.push(`추천 타패: ${tName}`);
    if (top.shanten === 0) lines.push(`텐파이 — ${top.ukeire.kinds}종 ${top.ukeire.total}장 대기`);
    else lines.push(`${shantenText(top.shanten)} · 유효패 ${top.ukeire.kinds}종 ${top.ukeire.total}장`);
    if (result.opponents.length) lines.push(`판단: ${stanceText}`);
    if (top.shanten > result.bestShanten) {
      lines.push(`${shantenText(result.bestShanten)}을 유지하는 위험패 대신, 한 단계 늦추더라도 안전한 패로 돌려치기(마와시)`);
    }
    return { tile: top.tile, lines, stance: result.stance, stanceText };
  }

  const MJ = {
    parseTiles,
    tilesToString,
    sortTiles,
    toCounts,
    tileName,
    tileCode,
    numOf,
    suitOf,
    isHonor,
    doraFromIndicator,
    calcShanten,
    shantenDetail,
    ukeire,
    evaluateWin,
    dangerAgainst,
    analyze,
    shantenText,
    WAIT_KO,
    SEAT_KO,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MJ;
  else global.MJ = MJ;
})(typeof window !== 'undefined' ? window : globalThis);
