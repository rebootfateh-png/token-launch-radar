// Token Radar dashboard. Reads window.RADAR (data.js, written by main.ts
// from the same board as board.json) and renders the ranked board, filters,
// sorting, a detail view for every protocol and a live-token view.
// No network: every byte shown is in data.js.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.getElementById('lede').textContent = 'No data found. Run main.ts first.'; return; }

  var state = { q: '', cat: 'all', chain: 'all', min: 0, sort: 'implied', dir: -1, tab: 'pre', sel: null };
  var $ = function (id) { return document.getElementById(id); };

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function age(d) { return d === null || d === undefined ? 'unknown' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // Hash state so a link opens the board, a detail view or a filtered view.
  function readHash() {
    state.q = ''; state.cat = 'all'; state.chain = 'all'; state.min = 0; state.tab = 'pre'; state.sel = null;
    var p = new URLSearchParams(location.hash.slice(1));
    if (p.get('q')) state.q = p.get('q');
    if (p.get('cat')) state.cat = p.get('cat');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('min')) state.min = +p.get('min') || 0;
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('p')) state.sel = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.min) p.set('min', String(state.min));
    if (state.tab !== 'pre') p.set('tab', state.tab);
    if (state.sel) p.set('p', state.sel);
    history.replaceState(null, '', p.toString() ? '#' + p.toString() : location.pathname);
  }

  function fillSelect(el, values) {
    values.forEach(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = v; el.appendChild(o);
    });
  }
  fillSelect($('cat'), Array.from(new Set(D.rows.map(function (r) { return r.category || 'Other'; }))).sort());
  fillSelect($('chain'), Array.from(new Set(D.rows.flatMap(function (r) { return r.chains || []; }))).sort());

  $('lede').textContent = 'Snapshot ' + D.as_of + ' · ' + D.watchlist_size + ' watchlist protocols at $50M+ TVL with no token on record, plus ' + D.early_size + ' pre-token protocols below the floor. Implied value is a model, not a promise.';
  $('stats').innerHTML =
    '<div><dt>Watchlist covered</dt><dd>' + D.watchlist_size + ' / ' + D.watchlist_size + '</dd></div>' +
    '<div><dt>Pre-token rows</dt><dd>' + D.board_size + '</dd></div>' +
    '<div><dt>Top implied value</dt><dd>' + usd(D.rows[0].implied_value_usd) + '</dd></div>' +
    '<div><dt>Global multiple</dt><dd>' + D.global_multiple.toFixed(2) + 'x</dd></div>';

  $('model').innerHTML = '<h2>How implied value is computed</h2>' +
    '<p>One function scores every protocol from the snapshot figures. The category multiple is the median market-cap / TVL of live-token protocols in the same category, blended toward the global median of ' + D.global_multiple.toFixed(2) + 'x when a category is thin, clamped to 0.05x–3.0x.</p>' +
    '<div class="formula">score = 45 x log-size(TVL) + 20 x growth(clamped -20% to +30%) + 20 x age(capped at 4y) + 15 x heat(multiple / 3)<br>implied = round( TVL x category-multiple x (0.75 + 0.5 x score / 100) )</div>' +
    '<p>Size is log-scaled so a $14B protocol does not swamp the board. Age is the time since DefiLlama first listed the protocol while it records no token; an unlisted age uses 365 days. Live-token protocols are set aside with their market caps shown, never mixed into the ranking.</p>';

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (state.cat !== 'all' && (r.category || 'Other') !== state.cat) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (r.score < state.min) return false;
      if (!q) return true;
      return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().includes(q);
    });
  }
  function sorted(list) {
    var k = state.sort, d = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (k === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (k === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (k === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (k === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (k === 'score') { av = a.score; bv = b.score; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -d; if (av > bv) return d;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function rowHtml(r) {
    var g = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    return '<tr data-slug="' + esc(r.slug) + '" class="' + (state.sel === r.slug ? 'sel' : '') + '">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' · ' + esc((r.chains || []).slice(0, 2).join(', ') || 'unnamed chain') + '</span></td>' +
      '<td class="num">' + usd(r.tvl_usd) + '</td>' +
      '<td class="num ' + g + '">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + age(r.age_days) + '</td>' +
      '<td><span class="score"><span class="bar"><i style="width:' + Math.round(r.score) + '%"></i></span><span class="num">' + r.score.toFixed(1) + '</span></span></td>' +
      '<td class="num"><b>' + usd(r.implied_value_usd) + '</b></td>' +
      '<td><span class="badge">no token</span></td></tr>';
  }

  function detailHtml(r) {
    var b = r.score_breakdown;
    var risks = [];
    if (r.age_days === null) risks.push('Listed date unknown, so the age part of the score uses 365 days.');
    if (r.change_7d !== null && r.change_7d < 0) risks.push('TVL fell ' + Math.abs(r.change_7d).toFixed(1) + '% in 7 days; the growth part of the score is below half.');
    if (r.category_multiple <= 0.1) risks.push('Live protocols in this category trade at a low market-cap / TVL multiple (' + r.category_multiple.toFixed(2) + 'x), so the implied value is modest.');
    if (r.tvl_usd < 50000000) risks.push('Below the $50M watchlist floor: smaller TVL means a thinner market if a token ever launches.');
    risks.push('The snapshot records no token; that is not proof the protocol has none, and it does not say whether or when one will launch.');
    var bar = function (label, v, max) {
      return '<div><span>' + label + '</span><span class="bar"><i style="width:' + Math.round(100 * v / max) + '%"></i></span><span class="num">' + v.toFixed(1) + '</span></div>';
    };
    return '<h2>Rank ' + r.rank + ' — ' + esc(r.name) + '</h2>' +
      '<p class="sub">' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).join(', ') || 'unnamed chain') + ' · listed ' + esc(r.listed_at || 'unknown') + ' · records no token</p>' +
      '<dl class="grid">' +
      '<div><dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + pct(r.change_7d) + '</dd></div>' +
      '<div><dt>Age with no token</dt><dd>' + age(r.age_days) + '</dd></div>' +
      '<div><dt>Category multiple</dt><dd>' + r.category_multiple.toFixed(2) + 'x</dd></div>' +
      '<div><dt>Score</dt><dd>' + r.score.toFixed(1) + ' / 100</dd></div>' +
      '<div><dt>Implied value</dt><dd>' + usd(r.implied_value_usd) + '</dd></div></dl>' +
      '<h3>Score breakdown</h3><div class="break">' + bar('Size (45)', b.size, 45) + bar('Growth (20)', b.growth, 20) + bar('Age (20)', b.age, 20) + bar('Heat (15)', b.heat, 15) + '</div>' +
      '<h3>Farm plan</h3><ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<h3>Risks</h3><p class="risks">' + risks.map(esc).join(' ') + '</p>' +
      '<p><button type="button" id="close-detail">Close detail</button></p>';
  }

  function render() {
    $('q').value = state.q; $('cat').value = state.cat; $('chain').value = state.chain; $('min').value = String(state.min);
    $('tab-pre').setAttribute('aria-pressed', String(state.tab === 'pre'));
    $('tab-live').setAttribute('aria-pressed', String(state.tab === 'live'));
    var body = $('rows');
    if (state.tab === 'live') {
      body.innerHTML = D.live.map(function (r) {
        return '<tr><td class="num">live</td><td><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' · ' + esc((r.chains || []).slice(0, 2).join(', ')) + '</span></td>' +
          '<td class="num">' + usd(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td><td class="num">—</td><td class="num">—</td>' +
          '<td class="num"><b>' + usd(r.mcap_usd) + '</b></td><td><span class="badge live">already trades</span></td></tr>';
      }).join('');
      $('count').textContent = D.live.length + ' live-token protocols — market cap is a fact, not a model.';
      $('detail').hidden = true;
      return;
    }
    var list = sorted(filtered());
    $('count').textContent = list.length + ' of ' + D.board_size + ' pre-token rows shown';
    body.innerHTML = list.length ? list.map(rowHtml).join('') : '<tr><td colspan="8"><div class="empty">No protocol matches that filter. Clear the search or pick another category.</div></td></tr>';
    var sel = state.sel ? D.rows.find(function (r) { return r.slug === state.sel; }) : null;
    var det = $('detail');
    if (sel) { det.innerHTML = detailHtml(sel); det.hidden = false; }
    else { det.innerHTML = ''; det.hidden = true; }
  }

  $('q').addEventListener('input', function (e) { state.q = e.target.value; state.sel = null; writeHash(); render(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; writeHash(); render(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); render(); });
  $('min').addEventListener('change', function (e) { state.min = +e.target.value; writeHash(); render(); });
  $('tab-pre').addEventListener('click', function () { state.tab = 'pre'; writeHash(); render(); });
  $('tab-live').addEventListener('click', function () { state.tab = 'live'; writeHash(); render(); });
  document.querySelectorAll('th button').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
      render();
    });
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    state.sel = tr.getAttribute('data-slug'); state.tab = 'pre'; writeHash(); render();
    $('detail').scrollIntoView({ block: 'nearest' });
  });
  $('detail').addEventListener('click', function (e) {
    if (e.target.id === 'close-detail') { state.sel = null; writeHash(); render(); }
  });
  addEventListener('hashchange', function () { readHash(); render(); });

  readHash();
  render();
})();
