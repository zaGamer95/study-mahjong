/* 패 DOM 렌더링 (분석기/가이드 공용) */
(function (global) {
  'use strict';
  const SUIT_CLASS = ['m', 'p', 's', 'z'];
  const SUIT_HANJA = ['萬', '筒', '索'];
  const HONOR_HANJA = ['東', '南', '西', '北', '白', '發', '中'];

  function tileEl(id, red, extraClass) {
    const el = document.createElement('span');
    const suit = Math.floor(id / 9);
    el.className = `tile ${SUIT_CLASS[suit]}${red ? ' red' : ''}${extraClass ? ' ' + extraClass : ''}`;
    if (suit === 3) {
      const n = id - 27;
      el.classList.add(`dragon-${n + 1}`);
      el.innerHTML = `<span class="n">${HONOR_HANJA[n]}</span>`;
    } else {
      el.innerHTML = `<span class="n">${(id % 9) + 1}</span><span class="s">${SUIT_HANJA[suit]}</span>`;
    }
    el.title = global.MJ ? global.MJ.tileName(id, red) + ` (${global.MJ.tileCode(id, red)})` : '';
    return el;
  }

  /** 가이드 문서의 `t:123m` 코드 조각을 패 그림으로 바꾼다 */
  function upgradeInlineTiles(root) {
    root.querySelectorAll('code').forEach((code) => {
      const m = code.textContent.match(/^t:\s*([0-9mpsz\s]+)$/);
      if (!m) return;
      try {
        const tiles = global.MJ.parseTiles(m[1]);
        const wrap = document.createElement('span');
        wrap.className = 'tile-inline';
        wrap.title = m[1].trim();
        // 공백은 그룹 구분
        const groups = m[1].trim().split(/\s+/);
        groups.forEach((g, gi) => {
          global.MJ.parseTiles(g).forEach((t) => wrap.appendChild(tileEl(t.id, t.red, 'xs')));
          if (gi < groups.length - 1) {
            const gap = document.createElement('span');
            gap.style.width = '6px';
            wrap.appendChild(gap);
          }
        });
        if (tiles.length) code.replaceWith(wrap);
      } catch (e) {
        /* 표기가 아니면 그대로 둔다 */
      }
    });
  }

  global.TileUI = { tileEl, upgradeInlineTiles };
})(window);
