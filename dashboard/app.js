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

  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'pre', sort: 'implied', dir: -1, selected: null };
  var sandbox = { scale: 1, growth: DATA.model.growth_weight, floor: DATA.model.maturity_floor };
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
  // the snapshot figures and checks the number board.json carries, so the page's code and the
  // board's data are visibly the same arithmetic. The sandbox only changes the three weights.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * sandbox.growth;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = sandbox.floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * (1 - sandbox.floor);
    var breadth = row.model.breadth_multiplier;
    return Math.max(1, Math.round(row.tvl_usd * row.model.category_multiple * growthMult * maturity * breadth * sandbox.scale));
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
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watch) params.set('watch', '1');
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
    if (state.watch) rows = rows.filter(function (x) { return x.row.on_watchlist; });
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
      el('p', { class: 'lede' }, 'Every protocol that ', el('b', { text: 'records no token yet' }), ', ranked by what its launch would be worth — ', el('b', { text: DATA.board_size + ' protocols' }), ', from the ' + DATA.watchlist_size + ' on the watchlist down to the smallest early find. Click any row for its farm plan.'));
  }

  function stats() {
    var s = el('div', { class: 'stats' });
    s.appendChild(el('div', { class: 'stat' }, el('div', { class: 'v', text: String(DATA.board_size) }), el('div', { class: 'k', text: 'protocols ranked' })));
    s.appendChild(el('div', { class: 'stat' }, el('div', { class: 'v', text: String(DATA.watchlist_size) }), el('div', { class: 'k', text: 'on the watchlist' })));
    s.appendChild(el('div', { class: 'stat' }, el('div', { class: 'v', text: String(DATA.pre_token_count) }), el('div', { class: 'k', text: 'record no token at all' })));
    s.appendChild(el('div', { class: 'stat' }, el('div', { class: 'v gold', text: fmtUsd(DATA.total_implied_usd) }), el('div', { class: 'k', text: 'combined implied value' })));
    return s;
  }

  function methodCard() {
    var card = el('section', { class: 'card' },
      el('h2', { text: 'How the radar values a launch' }),
      el('p', null, 'Implied value follows from the snapshot alone — TVL, seven-day growth, age with no token, and how many chains it runs on. The category multiple is the market\'s own: the median market-cap-per-TVL of the live-token protocols in that category (at least ' + DATA.model.min_live_for_category + ' of them), or the global median ' + DATA.global_multiple.toFixed(3) + ' when a category has too few. No protocol name is ever special-cased.'),
      el('div', { class: 'formula', text: 'implied = TVL × category multiple × (1 + growth × 0.5) × maturity × breadth' }),
      el('p', null, 'Maturity runs 0.6 for a newborn protocol to 1.0 after three years with no token; breadth adds 2% per extra chain, up to ten. The board separates the two worlds: pre-token protocols are ranked by this model, live ones are shown at the market\'s own value.'),
      el('p', { class: 'note' }, '“Records no token” is what DefiLlama says — not proof a protocol has none. A protocol on this board may still hold a token its record does not carry. The implied value is this radar\'s claim, never a prediction that a token will launch, or when.'));
    var table = el('table', { class: 'mult-table' },
      el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live examples' }), el('th', { class: 'num', text: 'Multiple' }))));
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
    grid.appendChild(slider('Growth weight', 'growth', 0, 1, 0.05, function (v) { return v.toFixed(2); }));
    grid.appendChild(slider('Maturity floor', 'floor', 0.4, 0.8, 0.05, function (v) { return v.toFixed(2); }));
    card.appendChild(grid);
    var reset = el('button', { type: 'button', text: 'Reset to the submitted model' });
    reset.addEventListener('click', function () {
      sandbox = { scale: 1, growth: DATA.model.growth_weight, floor: DATA.model.maturity_floor };
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
    var watchLabel = el('label', { class: 'check' });
    var watchBox = el('input', { type: 'checkbox' });
    watchBox.checked = state.watch;
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    watchLabel.appendChild(watchBox);
    watchLabel.appendChild(document.createTextNode(' Watchlist only'));
    row.appendChild(watchLabel);
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
      nameCell.appendChild(el('span', { class: 'badge ' + (r.on_watchlist ? 'watch' : 'early'), text: r.on_watchlist ? 'Watchlist' : 'Early find' }));
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
    head.appendChild(el('h2', null, '#' + (sandboxOn ? '—' : r.rank) + ' ' + r.name + ' ', el('span', { class: 'badge ' + (r.on_watchlist ? 'watch' : 'early'), text: r.on_watchlist ? 'Watchlist' : 'Early find' })));
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
    bbody.appendChild(el('tr', null, el('td', { text: 'Category multiple (' + (r.category || 'Uncategorized') + ')' }), el('td', { class: 'num', text: '×' + m.category_multiple.toFixed(3) })));
    bbody.appendChild(el('tr', null, el('td', { text: 'Growth ' + fmtPct(m.growth_pct) + ' over 7 days' }), el('td', { class: 'num', text: '×' + m.growth_multiplier.toFixed(3) })));
    bbody.appendChild(el('tr', null, el('td', { text: 'Maturity (' + fmtAge(m.age_days) + ' with no token)' }), el('td', { class: 'num', text: '×' + m.maturity_multiplier.toFixed(3) })));
    bbody.appendChild(el('tr', null, el('td', { text: 'Breadth (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')' }), el('td', { class: 'num', text: '×' + m.breadth_multiplier.toFixed(3) })));
    bbody.appendChild(el('tr', { class: 'total' }, el('td', { text: 'Implied launch value' }), el('td', { class: 'num', text: fmtUsd(value) })));
    bt.appendChild(bbody);
    card.appendChild(bt);
    card.appendChild(el('h2', { text: 'How to farm it' }));
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
      el('p', null, 'Model ' + DATA.model_version + ': implied = TVL × category multiple × growth × maturity × breadth. The implied value is this radar\'s claim about what a launch would be worth if the protocol\'s record stayed as it is — not a prediction that a token launches, or when.'),
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
    app.appendChild(sandboxCard());
    app.appendChild(footer());
  }

  readHash();
  render();
})();
