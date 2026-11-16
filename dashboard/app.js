'use strict';
/* Token Launch Radar — board, filters, detail view. All data comes from
   window.RADAR (../data.js, written by main.ts from the sealed snapshot).
   No network, no fetch: the page renders exactly what the board.json holds. */

const R = window.RADAR;
const rows = R.rows;
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n === null || n === undefined ? '—' : '$' + Math.round(n).toLocaleString('en-US'));
const pct = (n) => (n === null || n === undefined ? '—' : `<span class="${n >= 0 ? 'pos' : 'neg'}">${n >= 0 ? '+' : ''}${n.toFixed(1)}%</span>`);
const ageText = (d) => (d === null || d === undefined ? 'unknown' : d >= 730 ? `${(d / 365.25).toFixed(1)} yrs` : `${d} d`);
const VERDICT_ORDER = { farm: 0, thin: 1, skip: 2 };
const FLAG_TEXT = {
  wrapper: 'Wrapped or staked product of a token that already trades — flagged, verdict capped at skip.',
  cex: 'Centralised exchange that records no token of its own.',
  versioned: 'A later version of another protocol (its name ends in a version marker).',
};

/* ---------------- header and model strip ---------------- */

function fillHeader() {
  $('version').textContent = `model ${R.model_version}`;
  $('subline').innerHTML =
    `Every protocol in the sealed snapshot that <b>records no token</b> — <b>${R.counts.pre_token} protocols</b>, ` +
    `the house watchlist's ${R.counts.watchlist} included in full — ranked by the implied value of the token it may one day issue. ` +
    `Snapshot as of ${esc(R.as_of)}; ${R.counts.protocols} protocols in the file, ${R.counts.live} largest traded ones set aside below.`;
  const m = R.model;
  $('model-strip').innerHTML = `
    <div class="cell"><div class="k">The value model</div>
      <div class="formula">log10(mcap) = ${m.intercept.toFixed(3)} + ${m.tvl_coef.toFixed(3)}·log10(TVL) + ${m.age_coef.toFixed(3)}·log10(1 + age days)</div>
      <div class="note">Comps curve fitted by least absolute deviations on the snapshot's own ${m.n_comps} traded protocols with market cap and TVL at or above $5M. No name is ever special-cased.</div></div>
    <div class="cell"><div class="k">Tested blind</div>
      <div class="v big">×${m.band_ratio.toFixed(2)}</div>
      <div class="note">Median out-of-sample error: ${esc(m.validation.method)}. The model was refit on training folds and scored only on protocols it had never seen.</div></div>
    <div class="cell"><div class="k">Blind accuracy</div>
      <div class="v">${m.validation.within_2x_pct}% within 2×</div>
      <div class="note">${m.validation.within_5x_pct}% of held-out comps land within 5× of their real market cap. TVL and age price a launch loosely — so every value carries its band.</div></div>
    <div class="cell"><div class="k">The band</div>
      <div class="v">value ÷/× ${m.band_ratio.toFixed(2)}</div>
      <div class="note">Each row's band is its implied value divided and multiplied by the measured blind error — the error bar is the measurement, not decoration.</div></div>`;
  $('method').innerHTML = `
    <p><b>Coverage first.</b> The board holds all ${R.counts.pre_token} protocols that record no token — no market cap, no CoinGecko id, no symbol in the snapshot — not a top-N cut. The watchlist's ${R.counts.watchlist} are marked with a gold badge; the other ${R.counts.pre_token - R.counts.watchlist} are the early protocols below the watchlist's $50M floor that a radar exists to find. "Records no token" is the snapshot's statement, not proof none exists.</p>
    <p><b>Why no growth term.</b> The 7-day TVL change is shown on every row, and it was tested in the model — blind, on the same folds it made the median error worse (×2.43 against ×${m.band_ratio.toFixed(2)}): a one-week TVL spike is mostly mercenary flow that mean-reverts. It was left out on the evidence, and the number is published either way.</p>
    <p><b>Farm plans.</b> Each protocol's five steps are generated from its own record — category, main chain, TVL, age — with the capital, the monthly cost of staying active on that chain, and the hold time. The expected-pool line uses one labelled assumption: a launch allocates ${(m.pool_share * 100).toFixed(0)}% of implied value to early users. Verdicts net that pool against the cost: <span class="chip farm">farm</span> clears it, <span class="chip thin">thin</span> is marginal or capital-passive only, <span class="chip skip">skip</span> does not clear it. Nothing here predicts whether or when a token is issued.</p>`;
  $('foot').textContent = `Source: ${R.source}. Implied values are this entry's own model output, read off the sealed snapshot; they are claims about what a launch would be worth if the protocol's record stayed as it is, not predictions.`;
}

/* ---------------- board state, from the hash ---------------- */

function readState() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const p = new URLSearchParams(query || '');
  return {
    detail: path.startsWith('p/') ? path.slice(2) : null,
    q: p.get('q') || '',
    cat: p.get('cat') || '',
    chain: p.get('chain') || '',
    verdict: p.get('verdict') || '',
    wl: p.get('wl') === '1',
    sort: p.get('sort') || 'implied_value_usd',
    dir: p.get('dir') === 'asc' ? 1 : -1,
  };
}

function writeState(s, pushDetail) {
  if (pushDetail) {
    location.hash = `#/p/${pushDetail}`;
    return;
  }
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.cat) p.set('cat', s.cat);
  if (s.chain) p.set('chain', s.chain);
  if (s.verdict) p.set('verdict', s.verdict);
  if (s.wl) p.set('wl', '1');
  if (s.sort !== 'implied_value_usd') p.set('sort', s.sort);
  if (s.dir === 1) p.set('dir', 'asc');
  const qs = p.toString();
  history.replaceState(null, '', qs ? `#/?${qs}` : '#/');
}

function fillControls(s) {
  const cats = [...new Set(rows.map((r) => r.category || 'Uncategorised'))].sort();
  $('f-cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option ${c === s.cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  $('f-chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option ${c === s.chain ? 'selected' : ''}>${esc(c)}</option>`).join('');
  $('q').value = s.q;
  $('f-verdict').value = s.verdict;
  $('f-wl').checked = s.wl;
}

function filtered(s) {
  const q = s.q.trim().toLowerCase();
  let out = rows.filter((r) => {
    if (s.wl && !r.watchlist) return false;
    if (s.cat && (r.category || 'Uncategorised') !== s.cat) return false;
    if (s.chain && !r.chains.includes(s.chain)) return false;
    if (s.verdict && r.farm_verdict !== s.verdict) return false;
    if (q && !(`${r.name} ${r.slug} ${r.chains.join(' ')}`.toLowerCase().includes(q))) return false;
    return true;
  });
  const key = s.sort;
  out.sort((a, b) => {
    let x = a[key];
    let y = b[key];
    if (key === 'farm_verdict') { x = VERDICT_ORDER[a.farm_verdict]; y = VERDICT_ORDER[b.farm_verdict]; }
    if (x === null || x === undefined) x = -Infinity;
    if (y === null || y === undefined) y = -Infinity;
    if (typeof x === 'string') return s.dir * x.localeCompare(y) || a.rank - b.rank;
    return s.dir * (x - y) || a.rank - b.rank;
  });
  return out;
}

function renderBoard(s) {
  const list = filtered(s);
  $('row-count').textContent = `${list.length} of ${rows.length} protocols`;
  $('rows').innerHTML = list.map((r) => `
    <tr data-slug="${esc(r.slug)}">
      <td class="num dim">${r.rank}</td>
      <td class="name">${esc(r.name)}${r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : ''}${r.product_flag ? `<span class="badge flag">${esc(r.product_flag.toUpperCase())}</span>` : ''}<span class="slug">${esc(r.slug)}</span></td>
      <td class="dim">${esc(r.category || 'Uncategorised')}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num">${pct(r.change_7d)}</td>
      <td class="num dim">${ageText(r.age_days)}</td>
      <td class="num"><b>${money(r.implied_value_usd)}</b></td>
      <td class="num band">${money(r.implied_low_usd)} – ${money(r.implied_high_usd)}</td>
      <td><span class="chip ${r.farm_verdict}">${r.farm_verdict.toUpperCase()}</span></td>
    </tr>`).join('');
  for (const tr of document.querySelectorAll('#rows tr')) {
    tr.addEventListener('click', () => writeState(readState(), tr.dataset.slug));
  }
  $('live').innerHTML = '<div class="live-grid">' + R.live.map((l) => `
    <div class="live-card"><div><div class="n">${esc(l.name)} <span class="s">${esc(l.symbol || '')}</span></div>
    <div class="s">${esc(l.category || '')} · ${esc(l.chains.slice(0, 3).join(', '))}</div></div>
    <div class="m"><div class="mc">${money(l.mcap_usd)}</div><div class="tv">TVL ${money(l.tvl_usd)}</div></div></div>`).join('') + '</div>';
}

/* ---------------- detail view ---------------- */

function renderDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) { location.hash = '#/'; return; }
  const m = R.model;
  $('detail').innerHTML = `
    <div class="detail-head">
      <h2>${esc(r.name)}</h2>
      ${r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : ''}
      ${r.product_flag ? `<span class="badge flag">${esc(r.product_flag.toUpperCase())}</span>` : ''}
      <span class="chip ${r.farm_verdict}">${r.farm_verdict.toUpperCase()}</span>
      <span class="dim">rank #${r.rank} of ${rows.length} · ${esc(r.slug)}</span>
    </div>
    ${r.product_flag ? `<p class="detail-note">${esc(FLAG_TEXT[r.product_flag])}</p>` : ''}
    <div class="stat-grid">
      <div class="stat"><div class="k">Implied value</div><div class="v">${money(r.implied_value_usd)}</div></div>
      <div class="stat"><div class="k">Band (÷/× ${m.band_ratio.toFixed(2)})</div><div class="v">${money(r.implied_low_usd)} <small>to</small> ${money(r.implied_high_usd)}</div></div>
      <div class="stat"><div class="k">TVL</div><div class="v">${money(r.tvl_usd)}</div></div>
      <div class="stat"><div class="k">TVL change, 7d</div><div class="v">${pct(r.change_7d)}</div></div>
      <div class="stat"><div class="k">Running with no token</div><div class="v">${ageText(r.age_days)}</div></div>
      <div class="stat"><div class="k">Category</div><div class="v">${esc(r.category || 'Uncategorised')}</div></div>
      <div class="stat"><div class="k">Chains</div><div class="v">${esc(r.chains.join(', ') || '—')}</div></div>
      <div class="stat"><div class="k">Est. farm cost</div><div class="v">$${r.est_cost_month_usd}<small> / month</small></div></div>
    </div>
    <div class="bandbar">How the value is read: the comps curve takes this protocol's <b>TVL of ${money(r.tvl_usd)}</b> and its
    <b>${ageText(r.age_days)}</b> running with no token recorded, and prices it like the snapshot's ${m.n_comps} traded protocols of the same scale.
    The band is the model's measured blind error (×${m.band_ratio.toFixed(2)} median, out-of-sample) applied both ways — read the point value as the middle of that range, not as a price.</div>
    <ol class="steps"><h3>Farm plan — five steps</h3>
      ${r.farm_steps.map((s2) => `<li>${esc(s2)}</li>`).join('')}
    </ol>
    <p class="detail-note">The plan's expected-pool line assumes a launch allocates ${(m.pool_share * 100).toFixed(0)}% of implied value to early users — an assumption, stated wherever the figure is used, not a promise by the protocol. This board does not predict whether or when ${esc(r.name)} issues a token.</p>`;
}

/* ---------------- routing ---------------- */

function render() {
  const s = readState();
  const detail = s.detail !== null;
  $('board-view').hidden = detail;
  $('detail-view').hidden = !detail;
  if (detail) {
    renderDetail(s.detail);
    window.scrollTo(0, 0);
  } else {
    fillControls(s);
    renderBoard(s);
  }
}

for (const id of ['q', 'f-cat', 'f-chain', 'f-verdict', 'f-wl']) {
  $(id).addEventListener('input', () => {
    const s = readState();
    s.q = $('q').value;
    s.cat = $('f-cat').value;
    s.chain = $('f-chain').value;
    s.verdict = $('f-verdict').value;
    s.wl = $('f-wl').checked;
    writeState(s);
    renderBoard(s);
  });
}
for (const th of document.querySelectorAll('#board th[data-sort]')) {
  th.addEventListener('click', () => {
    const s = readState();
    const key = th.dataset.sort;
    if (s.sort === key) s.dir = -s.dir;
    else { s.sort = key; s.dir = key === 'name' || key === 'category' ? 1 : -1; }
    writeState(s);
    renderBoard(s);
  });
}

fillHeader();
window.addEventListener('hashchange', render);
render();
