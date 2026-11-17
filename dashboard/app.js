// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the model's
// own inputs and the protocol's farm plan, plus a sandbox that re-runs the model with the
// reader's weights. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  app.setAttribute('aria-busy', 'false');

  var state = { q: '', category: 'all', chain: 'all', group: 'all', tab: 'pre', sort: 'implied', dir: -1, selected: null };
  var sandbox = { scale: 1, growth: 1, maturity: 1 };
  var sandboxOn = false;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // The model in one function, the same arithmetic main.ts runs: the page recomputes a row from
  // the fitted comps value and its two tilts, so the page's code and the board's data are visibly
  // the same arithmetic. The sandbox only changes the three weights.
  function impliedOf(row) {
    var m = DATA.model;
    var fitted = row.model.fitted_value_usd;
    var mat = 1 + (row.model.maturity_multiplier - 1) * sandbox.maturity;
    var gro = 1 + (row.model.growth_multiplier - 1) * sandbox.growth;
    var ratio = (fitted * mat * gro) / row.tvl_usd;
    ratio = Math.min(m.ratio_cap, Math.max(m.ratio_floor, ratio));
    return Math.max(1, Math.round(row.tvl_usd * ratio * sandbox.scale));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('group')) state.group = params.get('group');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.group !== 'all') params.set('group', state.group);
    if (state.tab !== 'pre') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var h = params.toString();
    history.replaceState(null, '', h ? '#' + h : window.location.pathname + window.location.search);
  }

  /** A farm step string split back into action, cost and time. */
  function splitStep(s) {
    var costAt = s.indexOf(' Cost: ');
    var timeAt = s.indexOf(' Time: ');
    if (costAt < 0) return { text: s, cost: '', time: '' };
    var text = s.slice(0, costAt);
    var cost = timeAt > costAt ? s.slice(costAt + 7, timeAt) : s.slice(costAt + 7);
    var time = timeAt > costAt ? s.slice(timeAt + 7).replace(/\.$/, '') : '';
    return { text: text, cost: cost.replace(/\.$/, ''), time: time };
  }

  function filteredRows() {
    var rows = DATA.rows.map(function (r) {
      return { row: r, value: sandboxOn ? impliedOf(r) : r.implied_value_usd };
    });
    if (state.group !== 'all') rows = rows.filter(function (x) { return x.row.board_group === state.group; });
    if (state.category !== 'all') rows = rows.filter(function (x) { return (x.row.category || 'Uncategorized') === state.category; });
    if (state.chain !== 'all') rows = rows.filter(function (x) { return x.row.chains.indexOf(state.chain) >= 0; });
    if (state.q) {
      var q = state.q.toLowerCase();
      rows = rows.filter(function (x) {
        return x.row.name.toLowerCase().indexOf(q) >= 0 || x.row.slug.indexOf(q) >= 0 || (x.row.category || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    var key = state.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = a.value; bv = b.value; }
      else if (key === 'tvl') { av = a.row.tvl_usd; bv = b.row.tvl_usd; }
      else if (key === 'growth') { av = a.row.change_7d === null ? -9999 : a.row.change_7d; bv = b.row.change_7d === null ? -9999 : b.row.change_7d; }
      else if (key === 'age') { av = a.row.age_days === null ? -1 : a.row.age_days; bv = b.row.age_days === null ? -1 : b.row.age_days; }
      else { av = a.row.name.toLowerCase(); bv = b.row.name.toLowerCase(); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.row.slug < b.row.slug ? -1 : 1;
    });
    return rows;
  }

  function header() {
    return el('header', null,
      el('div', { class: 'eyebrow', text: 'DefiLlama snapshot · ' + DATA.as_of + ' · ' + DATA.total_protocols + ' protocols tracked' }),
      el('h1', null, 'Token Radar', el('span', { class: 'dot', text: '.' })),
      el('p', { class: 'lede' }, 'Every protocol that ', el('b', { text: 'records no token yet' }), ', ranked by what its launch would be worth — ', el('b', { text: DATA.board_size + ' protocols' }), ': the ' + DATA.watchlist_size + ' on the watchlist, ' + DATA.off_watchlist_size + ' more above the floor the watchlist leaves out, and ' + DATA.early_size + ' early finds below it. Click any row for its farm plan.'));
  }

  function stats() {
    var s = el('div', { class: 'stats' });
    s.appendChild(el('div', { class: 'stat' }, el('div', { class: 'v', text: String(DATA.board_size) }), el('div', { class: 'k', text: 'protocols ranked' })));
    s.appendChild(el('div', { class: 'stat' }, el('div', { class: 'v', text: String(DATA.watchlist_size) }), el('div', { class: 'k', text: 'on the watchlist' })));
    s.appendChild(el('div', { class: 'stat' }, el('div', { class: 'v', text: String(DATA.off_watchlist_size) }), el('div', { class: 'k', text: 'off-watchlist, above the floor' })));
    s.appendChild(el('div', { class: 'stat' }, el('div', { class: 'v gold', text: fmtUsd(DATA.total_implied_usd) }), el('div', { class: 'k', text: 'combined implied value' })));
    return s;
  }

  function methodCard() {
    var v = DATA.validation;
    var card = el('section', { class: 'card' },
      el('h2', { text: 'How the radar values a launch' }),
      el('p', null, 'Implied value is a fitted comps model, not a median and not a list of names. The program fits log market cap on log TVL over the ' + v.fit.n_comps + ' live-token protocols that already trade — one per ticker, dead tokens left out — and prices each pre-token protocol off that line. The slope is ' + v.fit.slope.toFixed(3) + ', below 1: a dollar of TVL is worth less at a giant protocol than at a small one, so the old median multiple, which priced every TVL dollar the same, overpriced the giants by several times. Two small tilts follow: maturity, ' + DATA.model.maturity_floor + ' for a newborn protocol rising to ' + (DATA.model.maturity_floor + DATA.model.maturity_range).toFixed(2) + ' after three years with no token, and growth, ' + DATA.model.growth_weight + ' of the 7-day TVL change, clamped to ' + DATA.model.growth_floor + '%…+' + DATA.model.growth_cap + '%. The tilts are capped on purpose: they keep the board from being a TVL sort without letting a hot week or an old listing dominate the fitted value.'),
      el('div', { class: 'formula', text: 'implied = 10^(' + v.fit.intercept.toFixed(3) + ' + ' + v.fit.slope.toFixed(3) + ' × log10(TVL)) × maturity × growth' }),
      el('p', null, 'The board separates the two worlds: pre-token protocols are ranked by this model, live ones are shown at the market\'s own value. The median-multiple rule is kept as a comparison — the detail view shows what it would have said for each protocol — because a model that cannot be compared cannot be trusted.'),
      el('p', { class: 'note' }, '“Records no token” is what DefiLlama says — not proof a protocol has none. A protocol on this board may still hold a token its record does not carry, and the ' + DATA.off_watchlist_size + ' off-watchlist rows are the honest edge of that: they clear every rule the snapshot can show, but the snapshot carries no parent-protocol record, so it cannot rule out that one of them is a product of a protocol whose token already trades. The implied value is this radar\'s claim, never a prediction that a token will launch, or when.'));
    var table = el('table', { class: 'mult-table' },
      el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live examples' }), el('th', { class: 'num', text: 'Median multiple' }))));
    var body = el('tbody');
    DATA.category_multiples.forEach(function (c) {
      body.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.live_count) }),
        el('td', { class: 'num', text: '×' + c.multiple.toFixed(3) })));
    });
    table.appendChild(body);
    card.appendChild(table);
    return card;
  }

  function validationCard() {
    var v = DATA.validation;
    var card = el('section', { class: 'card' },
      el('h2', { text: 'Does the model hold up? It was tested on the snapshot itself' }),
      el('p', null, 'The fit is log10(market cap) = ' + v.fit.intercept.toFixed(3) + ' + ' + v.fit.slope.toFixed(3) + ' × log10(TVL), fitted on ' + v.fit.n_comps + ' live-token comps, with a residual spread of ' + v.fit.residual_sd_dex.toFixed(2) + ' dex. Two tests ran on the same snapshot — leave-one-out, and a cohort check that fits on the protocols listed before a date and tests on the ones listed after it — each against the old median-multiple rule on the same protocols.'));
    function runTable(rows, cols) {
      var table = el('table', { class: 'mult-table' });
      var head = el('tr', null, el('th', { text: 'Test' }));
      cols.forEach(function (c) { head.appendChild(el('th', { class: 'num', text: c })); });
      table.appendChild(el('thead', null, head));
      var body = el('tbody');
      rows.forEach(function (r) {
        var tr = el('tr', null, el('td', { text: r[0] }));
        for (var i = 1; i < r.length; i++) tr.appendChild(el('td', { class: 'num', text: r[i] }));
        body.appendChild(tr);
      });
      table.appendChild(body);
      return table;
    }
    var loo = v.loo;
    card.appendChild(el('p', null, el('b', { text: 'Leave-one-out, ' + loo.n_test + ' comps: ' }), 'refit without each protocol in turn and predict it. The fitted value beats the median rule on every level and ranking number except the top-10 count, where the median takes one more.'));
    card.appendChild(runTable([
      ['Fitted comps model', loo.fitted_log_r2.toFixed(2), loo.fitted_log_mae_dex.toFixed(2), '×' + (1 + loo.fitted_median_ape).toFixed(2), loo.fitted_spearman.toFixed(2), loo.fitted_top10 + ' / 10'],
      ['Median-multiple rule', loo.median_log_r2.toFixed(2), '—', '×' + (1 + loo.median_median_ape).toFixed(2), loo.median_spearman.toFixed(2), loo.median_top10 + ' / 10'],
    ], ['Log R²', 'Mean |error| (dex)', 'Typical error', 'Rank ρ', 'Top 10']));
    card.appendChild(el('p', null, el('b', { text: 'Cohort check: ' }), 'does the ranking hold for newer launches? The fitted value outranks the median rule in two of the three cohorts; the newest cohort is the hardest — its launches are priced on more than TVL, so the board\'s ranking is the claim, not its dollar levels.'));
    var cohortRows = v.cohorts.map(function (c) {
      return [c.label + ' (n=' + c.n_test + ')', c.fitted_spearman.toFixed(2) + ' vs ' + c.median_spearman.toFixed(2), '×' + (1 + c.fitted_median_ape).toFixed(2) + ' vs ×' + (1 + c.median_median_ape).toFixed(2), c.fitted_top10 + ' vs ' + c.median_top10];
    });
    card.appendChild(runTable(cohortRows, ['Rank ρ, fitted vs median', 'Typical error, fitted vs median', 'Top 10, fitted vs median']));
    card.appendChild(el('p', { class: 'note' }, 'Read the numbers plainly: launch values are uncertain — the typical prediction lands within about twice the truth, and half of comparable launches fall within the plausible range the detail view shows. What the tests show is that a fitted price of size beats pricing every TVL dollar the same, and that the ranking survives being tested on protocols the fit never saw.'));
    return card;
  }

  function sandboxCard() {
    var card = el('section', { class: 'card sandbox' },
      el('h2', { text: 'Model sandbox — re-rank it yourself' }),
      el('p', null, 'Move a weight and the board re-ranks in the page, with the same arithmetic. The submitted board keeps the default weights.'));
    var grid = el('div', { class: 'row' });
    function slider(label, key, min, max, step, fmt) {
      var wrap = el('div');
      var lab = el('label', null, label + ' — ', el('b', { text: fmt(sandbox[key]) }));
      var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(sandbox[key]), 'aria-label': label });
      input.addEventListener('input', function () {
        sandbox[key] = parseFloat(input.value);
        lab.querySelector('b').textContent = fmt(sandbox[key]);
        sandboxOn = true;
        render();
      });
      wrap.appendChild(lab);
      wrap.appendChild(input);
      return wrap;
    }
    grid.appendChild(slider('Value scale', 'scale', 0.5, 2, 0.05, function (v) { return '×' + v.toFixed(2); }));
    grid.appendChild(slider('Growth tilt', 'growth', 0, 1, 0.05, function (v) { return v.toFixed(2); }));
    grid.appendChild(slider('Maturity tilt', 'maturity', 0, 1, 0.05, function (v) { return v.toFixed(2); }));
    card.appendChild(grid);
    var reset = el('button', { type: 'button', text: 'Reset to the submitted model' });
    reset.addEventListener('click', function () {
      sandbox = { scale: 1, growth: 1, maturity: 1 };
      sandboxOn = false;
      render();
    });
    card.appendChild(reset);
    if (sandboxOn) card.appendChild(el('p', { class: 'note', text: 'Sandbox active: the table below is re-ranked with your weights. Reset to see the submitted board.' }));
    return card;
  }

  function controls() {
    var wrap = el('div');
    var tabs = el('div', { class: 'tabs', role: 'tablist' });
    var pre = el('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token · ' + DATA.board_size });
    var live = el('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': state.tab === 'live' ? 'true' : 'false', text: 'Already trading · ' + DATA.live_size });
    pre.addEventListener('click', function () { state.tab = 'pre'; state.selected = null; writeHash(); render(); });
    live.addEventListener('click', function () { state.tab = 'live'; state.selected = null; writeHash(); render(); });
    tabs.appendChild(pre);
    tabs.appendChild(live);
    wrap.appendChild(tabs);
    if (state.tab === 'live') return wrap;

    var row = el('div', { class: 'controls' });
    var search = el('input', { type: 'search', placeholder: 'Search name, slug or category…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderTableOnly(); });
    row.appendChild(search);
    var cats = ['all'].concat(Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; })) ).sort());
    var catSel = el('select', { 'aria-label': 'Filter by category' });
    cats.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All categories' : c });
      if (c === state.category) o.selected = true;
      catSel.appendChild(o);
    });
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    row.appendChild(catSel);
    var chains = ['all'].concat(Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains; }))).sort());
    var chainSel = el('select', { 'aria-label': 'Filter by chain' });
    chains.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All chains' : c });
      if (c === state.chain) o.selected = true;
      chainSel.appendChild(o);
    });
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    row.appendChild(chainSel);
    var groupSel = el('select', { 'aria-label': 'Filter by board group' });
    [['all', 'All groups'], ['watchlist', 'Watchlist'], ['early', 'Early finds'], ['off-watchlist', 'Off-watchlist']].forEach(function (g) {
      var o = el('option', { value: g[0], text: g[1] });
      if (g[0] === state.group) o.selected = true;
      groupSel.appendChild(o);
    });
    groupSel.addEventListener('change', function () { state.group = groupSel.value; writeHash(); render(); });
    row.appendChild(groupSel);
    wrap.appendChild(row);
    return wrap;
  }

  function sortHeader(label, key, cls) {
    var th = el('th', { class: cls || '', text: label + (state.sort === key ? (state.dir === -1 ? ' ↓' : ' ↑') : '') });
    th.addEventListener('click', function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      writeHash();
      render();
    });
    return th;
  }

  function groupBadge(r) {
    if (r.board_group === 'watchlist') return { cls: 'watch', text: 'Watchlist' };
    if (r.board_group === 'off-watchlist') return { cls: 'off', text: 'Off-watchlist' };
    return { cls: 'early', text: 'Early find' };
  }

  function boardTable() {
    var rows = filteredRows();
    var wrap = el('div');
    wrap.appendChild(el('p', { class: 'count-line' }, 'Showing ', el('b', { text: String(rows.length) }), ' of ' + DATA.board_size + ' ranked protocols' + (sandboxOn ? ' — re-ranked by your sandbox weights' : '') + '. Click a row for its detail and farm plan.'));
    var table = el('table', { class: 'board' });
    var head = el('tr');
    head.appendChild(sortHeader('#', 'implied'));
    head.appendChild(sortHeader('Protocol', 'name'));
    head.appendChild(el('th', { text: 'Category' }));
    head.appendChild(el('th', { text: 'Chains' }));
    head.appendChild(sortHeader('TVL', 'tvl', 'num'));
    head.appendChild(sortHeader('7d', 'growth', 'num'));
    head.appendChild(sortHeader('Age', 'age', 'num'));
    head.appendChild(sortHeader('Implied value', 'implied', 'num'));
    table.appendChild(el('thead', null, head));
    var body = el('tbody');
    if (rows.length === 0) {
      body.appendChild(el('tr', null, el('td', { class: 'empty', colspan: '8', text: 'No protocol matches this filter.' })));
    }
    rows.forEach(function (x, i) {
      var r = x.row;
      var tr = el('tr', { class: state.selected === r.slug ? 'sel' : '' });
      tr.addEventListener('click', function () {
        state.selected = state.selected === r.slug ? null : r.slug;
        writeHash();
        render();
      });
      tr.appendChild(el('td', { class: 'rank', text: String(sandboxOn ? i + 1 : r.rank) }));
      var nameCell = el('td', { class: 'name' });
      nameCell.appendChild(el('b', { text: r.name }));
      nameCell.appendChild(el('span', { class: 'slug', text: r.slug }));
      var badge = groupBadge(r);
      nameCell.appendChild(el('span', { class: 'badge ' + badge.cls, text: badge.text }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { text: r.category || '—' }));
      tr.appendChild(el('td', { class: 'chains', text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      var g = el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) });
      tr.appendChild(g);
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'num value', text: fmtUsd(x.value) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  function liveTable() {
    var wrap = el('div');
    wrap.appendChild(el('p', { class: 'count-line' }, 'These protocols already have a token that trades, so they are shown at the ', el('b', { text: 'market\'s own value' }), ' — never mixed into the ranked board.'));
    var table = el('table', { class: 'board' });
    table.appendChild(el('thead', null, el('tr', null,
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'Chains' }),
      el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: '7d' }), el('th', { class: 'num', text: 'Market cap' }))));
    var body = el('tbody');
    DATA.live.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'slug', text: r.slug })));
      tr.appendChild(el('td', { text: r.category || '—' }));
      tr.appendChild(el('td', { class: 'chains', text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }));
      tr.appendChild(el('td', { class: 'num value', text: fmtUsd(r.mcap_usd) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  function detailView() {
    if (!state.selected) return null;
    var r = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.selected) { r = DATA.rows[i]; break; }
    if (!r) return null;
    var value = sandboxOn ? impliedOf(r) : r.implied_value_usd;
    var card = el('section', { class: 'card detail' });
    var head = el('header');
    var badge = groupBadge(r);
    head.appendChild(el('h2', null, '#' + (sandboxOn ? '—' : r.rank) + ' ' + r.name + ' ', el('span', { class: 'badge ' + badge.cls, text: badge.text })));
    var close = el('button', { class: 'close', type: 'button', text: 'Close ✕' });
    close.addEventListener('click', function () { state.selected = null; writeHash(); render(); });
    head.appendChild(close);
    card.appendChild(head);
    card.appendChild(el('p', null, (r.category || 'Uncategorized') + ' · ' + r.chains.join(', ') + ' · tracked since ' + (r.listed_at || 'unknown') + ' · records no token.'));
    var grid = el('div', { class: 'dgrid' });
    grid.appendChild(el('div', { class: 'dcell' }, el('div', { class: 'k', text: 'Implied value' }), el('div', { class: 'v gold', text: fmtUsd(value) })));
    grid.appendChild(el('div', { class: 'dcell' }, el('div', { class: 'k', text: 'TVL' }), el('div', { class: 'v', text: fmtUsd(r.tvl_usd) })));
    grid.appendChild(el('div', { class: 'dcell' }, el('div', { class: 'k', text: '7-day TVL change' }), el('div', { class: 'v ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) })));
    grid.appendChild(el('div', { class: 'dcell' }, el('div', { class: 'k', text: 'Age with no token' }), el('div', { class: 'v', text: fmtAge(r.age_days) })));
    card.appendChild(grid);
    card.appendChild(el('h2', { text: 'How the number is built' }));
    var m = r.model;
    var bt = el('table', { class: 'model-break' });
    var bbody = el('tbody');
    bbody.appendChild(el('tr', null, el('td', { text: 'TVL' }), el('td', { class: 'num', text: fmtUsd(r.tvl_usd) })));
    bbody.appendChild(el('tr', null, el('td', { text: 'Fitted comps value (10^(' + DATA.validation.fit.intercept.toFixed(3) + ' + ' + DATA.validation.fit.slope.toFixed(3) + ' × log10(TVL)))' }), el('td', { class: 'num', text: fmtUsd(m.fitted_value_usd) })));
    bbody.appendChild(el('tr', null, el('td', { text: 'Maturity (' + fmtAge(m.age_days) + ' with no token)' }), el('td', { class: 'num', text: '×' + m.maturity_multiplier.toFixed(3) })));
    bbody.appendChild(el('tr', null, el('td', { text: 'Growth (' + fmtPct(r.change_7d) + ' over 7 days)' }), el('td', { class: 'num', text: '×' + m.growth_multiplier.toFixed(3) })));
    bbody.appendChild(el('tr', null, el('td', { text: 'Plausible range (half of comparable launches fall inside)' }), el('td', { class: 'num', text: fmtUsd(m.plausible_low_usd) + ' – ' + fmtUsd(m.plausible_high_usd) })));
    bbody.appendChild(el('tr', null, el('td', { text: 'Median-multiple rule would say' }), el('td', { class: 'num', text: fmtUsd(m.median_value_usd) })));
    bbody.appendChild(el('tr', { class: 'total' }, el('td', { text: 'Implied launch value' }), el('td', { class: 'num', text: fmtUsd(value) })));
    bt.appendChild(bbody);
    card.appendChild(bt);
    card.appendChild(el('h2', { text: 'How to farm it' }));
    card.appendChild(el('p', { class: 'note', text: 'Farm budget: $' + r.farm.capital_usd + ' of capital and about $' + r.farm.gas_usd + ' of gas, held for ' + r.farm.days + ' days.' }));
    var ol = el('ol', { class: 'farm' });
    r.farm_steps.forEach(function (s) {
      var p = splitStep(s);
      var li = el('li', null, document.createTextNode(p.text));
      li.appendChild(el('span', { class: 'meta' }, 'Cost: ', el('b', { text: p.cost }), ' · Time: ', el('b', { text: p.time })));
      ol.appendChild(li);
    });
    card.appendChild(ol);
    card.appendChild(el('p', { class: 'note', text: 'Never pay to claim: a real airdrop claim costs only gas, and only from the protocol\'s own page.' }));
    return card;
  }

  function footer() {
    return el('footer', null,
      el('p', null, 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '; the board is frozen to it, so every run of the program writes the same board.'),
      el('p', null, 'Model ' + DATA.model_version + ': implied = 10^(' + DATA.validation.fit.intercept.toFixed(3) + ' + ' + DATA.validation.fit.slope.toFixed(3) + ' × log10(TVL)) × maturity × growth, fitted on ' + DATA.validation.fit.n_comps + ' live-token comps. The implied value is this radar\'s claim about what a launch would be worth if the protocol\'s record stayed as it is — not a prediction that a token launches, or when.'),
      el('p', null, 'Built by an AI agent for make.fun\'s “Build the best token launch radar” bounty.'));
  }

  function renderTableOnly() {
    var old = document.getElementById('table-wrap');
    if (!old) { render(); return; }
    var next = boardTable();
    next.id = 'table-wrap';
    old.replaceWith(next);
  }

  function render() {
    app.innerHTML = '';
    app.appendChild(header());
    app.appendChild(stats());
    app.appendChild(controls());
    var detail = detailView();
    if (detail) app.appendChild(detail);
    var wrap = state.tab === 'pre' ? boardTable() : liveTable();
    wrap.id = 'table-wrap';
    app.appendChild(wrap);
    app.appendChild(methodCard());
    app.appendChild(validationCard());
    app.appendChild(sandboxCard());
    app.appendChild(footer());
  }

  readHash();
  render();
})();
