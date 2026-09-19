const test = require('node:test');
const assert = require('node:assert');
const MJ = require('../js/engine.js');

const counts = (s) => MJ.toCounts(MJ.parseTiles(s));

test('parseTiles / tilesToString', () => {
  const t = MJ.parseTiles('123m 0p 55z');
  assert.deepStrictEqual(t.map((x) => x.id), [0, 1, 2, 13, 31, 31]);
  assert.strictEqual(t[3].red, true);
  assert.strictEqual(MJ.tilesToString(t), '123m0p55z');
  assert.throws(() => MJ.parseTiles('8z'));
  assert.throws(() => MJ.parseTiles('123'));
});

test('shanten: complete, tenpai, chiitoi, kokushi', () => {
  assert.strictEqual(MJ.calcShanten(counts('123456789m11122z')), -1);
  assert.strictEqual(MJ.calcShanten(counts('123456789m1112z')), 0);
  assert.strictEqual(MJ.calcShanten(counts('1133557799m11p2p')), 0); // 치또이 텐파이 (13장)
  assert.strictEqual(MJ.calcShanten(counts('19m19p19s1234567z')), 0); // 국사 13면
  assert.strictEqual(MJ.calcShanten(counts('147m258p369s1234z')), 6);
  assert.strictEqual(MJ.calcShanten(counts('123m456p789s1122z'), 0), 0); // 샤보 대기
  assert.strictEqual(MJ.calcShanten(counts('1234m'), 3), 0); // 후로 3개 + 단기
});

test('ukeire counts remaining tiles', () => {
  const c = counts('123456789m2378s');
  const u = MJ.ukeire(c, 0);
  // 23s78s 두 양면: 1s4s6s9s → 1샨텐 유효패
  assert.deepStrictEqual(u.tiles.map((t) => MJ.tileName(t.id)).sort(), ['1삭', '4삭', '6삭', '9삭', '2삭', '3삭', '7삭', '8삭'].sort());
});

test('doraFromIndicator wraps', () => {
  assert.strictEqual(MJ.doraFromIndicator(8), 0); // 9m → 1m
  assert.strictEqual(MJ.doraFromIndicator(30), 27); // 북 → 동
  assert.strictEqual(MJ.doraFromIndicator(33), 31); // 중 → 백
});

test('evaluateWin: pinfu tanyao / yakuhai / no yaku', () => {
  const ctx = { seatWind: 0, roundWind: 0, doraIds: [], redCount: 0 };
  const a = MJ.evaluateWin(counts('234567m345p678s55p'), [], 1, ctx); // 2m 양면 화료
  const names = a.yaku.map((y) => y.name);
  assert.ok(names.includes('탕야오') && names.includes('핑후'), names.join());
  const pon = [{ type: 'tri', id: 31 }];
  const b = MJ.evaluateWin(counts('234m567p678s55p'), pon, 1, ctx);
  assert.ok(b.yaku.some((y) => y.name === '역패 백'));
  const c = MJ.evaluateWin(counts('123m567p678s11z'), [{ type: 'seq', id: 18 }], 0, ctx);
  assert.strictEqual(c.hasYaku, false);
});

test('danger: genbutsu, suji, musuji, honors', () => {
  const unseen = new Array(34).fill(3);
  assert.strictEqual(MJ.dangerAgainst(4, [4], unseen).pct, 0);
  assert.ok(MJ.dangerAgainst(0, [3], unseen).pct < 3); // 4m 버림 → 1m 스지
  assert.ok(MJ.dangerAgainst(4, [], unseen).pct > 10); // 무스지 5m
  unseen[27] = 1;
  assert.ok(MJ.dangerAgainst(27, [], unseen).pct <= 1);
});

test('analyze: discards isolated honor over shape', () => {
  const r = MJ.analyze({ hand: MJ.parseTiles('23m456p789s1134m4z5z').slice(0, 14), discards: {}, threat: {} });
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.mode, 'discard');
  assert.ok(MJ.isHonor(r.candidates[0].tile.id), MJ.tileName(r.candidates[0].tile.id));
});

test('analyze: picks tenpai with better wait', () => {
  // 23456m + 9m: 9m 버리면 1-4-7m 삼면, 2m 버리면 3-6m 양면
  const r = MJ.analyze({ hand: MJ.parseTiles('234569m456p789s11z'), discards: {}, threat: {} });
  const top = r.candidates[0];
  assert.strictEqual(MJ.tileName(top.tile.id), '9만');
  assert.strictEqual(top.ukeire.kinds, 3);
});

test('analyze: folds against riichi when far from tenpai', () => {
  const r = MJ.analyze({
    hand: MJ.parseTiles('159m258p369s1234z5m'),
    discards: { shimocha: MJ.parseTiles('9s1m') },
    threat: { shimocha: 'riichi' },
  });
  assert.strictEqual(r.stance, 'fold');
  assert.strictEqual(r.candidates[0].dangerPct, 0);
});

test('analyze: furiten detection', () => {
  const r = MJ.analyze({ hand: MJ.parseTiles('123456789m23p11z9s'), discards: { self: MJ.parseTiles('1p') }, threat: {} });
  const top = r.candidates.find((x) => x.tile.id === 26);
  assert.ok(top.tenpai.furiten);
});

test('analyze: 13 tiles reports waits', () => {
  const r = MJ.analyze({ hand: MJ.parseTiles('123456789m23p11z'), discards: {}, threat: {} });
  assert.strictEqual(r.mode, 'waiting');
  assert.strictEqual(r.shanten, 0);
  assert.strictEqual(r.ukeire.total, 8);
});

test('analyze: input errors', () => {
  const r = MJ.analyze({ hand: MJ.parseTiles('11111m'), discards: {}, threat: {} });
  assert.ok(r.errors.length);
});

test('performance: full analysis under 1.5s', () => {
  const t0 = Date.now();
  MJ.analyze({ hand: MJ.parseTiles('1122335577889m1p'), discards: {}, threat: {} });
  MJ.analyze({ hand: MJ.parseTiles('13579m2468p13s15z'), discards: {}, threat: {} });
  assert.ok(Date.now() - t0 < 1500, `${Date.now() - t0}ms`);
});
