/**
 * kpi-layer.js  —  KPI / measurement overlay for the Reach Riverside logic model.
 *
 * Decoupled prototype: runs AFTER dashboard.js renders and *decorates* the
 * logic-model cards in the DOM. It does not modify the dashboard internals.
 *
 * BASELINE + SERIES + GOAL model: each indicator has a 2018 `baseline`, a
 * `series` of actuals (2023/2024/2025), and a 2026 `target` (goal). The visual
 * is PROGRESS from baseline toward the goal — a progress bar plus a per-year
 * trajectory chart with the goal drawn as a reference line. Status color
 * reflects how far the current value has progressed toward the goal.
 *
 * Data: assets/indicators.json, keyed by exact logic-model row label.
 */
(function () {
  'use strict';

  var NS = 'momentum-dashboard';
  var LM_COLUMNS = [
    { id: NS + '-outputs', label: 'Outputs' },
    { id: NS + '-immediate-outputs', label: 'Short-term Outcomes' },
    { id: NS + '-intermediate-outputs', label: 'Intermediate Outcomes' },
    { id: NS + '-long-term-outputs', label: 'Long-term Outcomes' },
  ];

  // Status = progress toward the 2026 goal.
  var STATUS = {
    'on-track': { color: '#2e8b57', label: 'On track to goal' },
    'at-risk': { color: '#e0a200', label: 'Approaching' },
    'off-track': { color: '#d9534f', label: 'Behind' },
    'no-data': { color: '#9aa0a6', label: 'No goal set' },
  };
  var STATUS_RANK = { 'off-track': 3, 'at-risk': 2, 'on-track': 1, 'no-data': 0 };

  var indicators = {};
  var state = { metricsOn: true, colorByStatus: false, view: 'all' }; // view: all | core | gaps | attention

  // ---- helpers -------------------------------------------------------------
  var norm = function (s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); };

  var isNum = function (v) {
    return v !== null && v !== undefined && v !== '' && !(typeof v === 'string' && isNaN(Number(v)));
  };
  var fmtVal = function (v, unit) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'string' && isNaN(Number(v))) return v; // "tbd" / "did not track"
    var n = Number(v);
    if (unit === '$') return '$' + n.toLocaleString();
    if (unit === '%') return n + '%';
    return n.toLocaleString();
  };

  var baselineVal = function (ind) { return isNum(ind.baseline) ? Number(ind.baseline) : null; };
  var targetVal = function (ind) { return isNum(ind.target) ? Number(ind.target) : null; };

  // numeric series points in year order
  var seriesPoints = function (ind) {
    var s = ind.series || {};
    return Object.keys(s).map(function (y) { return { year: parseInt(y, 10), raw: s[y], value: Number(s[y]) }; })
      .filter(function (p) { return !isNaN(p.year); })
      .sort(function (a, b) { return a.year - b.year; });
  };
  var numericSeries = function (ind) { return seriesPoints(ind).filter(function (p) { return isNum(p.raw); }); };
  var currentPoint = function (ind) { var n = numericSeries(ind); return n.length ? n[n.length - 1] : null; };

  // progress from baseline -> goal (0..1.05), respecting direction
  var progress = function (ind) {
    var t = targetVal(ind), cur = currentPoint(ind);
    if (t === null || !cur) return null;
    var b = baselineVal(ind); if (b === null) b = 0; // missing baseline -> treat as 0
    if (t === b) return cur.value >= t ? 1 : 0;
    var p = ind.direction === 'down' ? (b - cur.value) / (b - t) : (cur.value - b) / (t - b);
    return Math.max(0, Math.min(1.05, p));
  };

  var statusOf = function (ind) {
    var p = progress(ind);
    if (p === null) return 'no-data';
    if (p >= 0.67) return 'on-track';
    if (p >= 0.34) return 'at-risk';
    return 'off-track';
  };
  var rollupStatus = function (list) {
    return list.reduce(function (worst, ind) {
      var s = statusOf(ind);
      return STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst;
    }, 'no-data');
  };

  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  var pctText = function (ind) {
    var p = progress(ind);
    return p === null ? '' : Math.round(p * 100) + '% to goal';
  };

  // progress bar (baseline -> goal), fill = progress, colored by status
  var progressBar = function (ind, big) {
    var st = statusOf(ind), p = progress(ind);
    var track = el('div', 'kpi-bar-track' + (big ? ' kpi-bar-lg' : ''));
    var fill = el('div', 'kpi-bar-fill');
    fill.style.width = (p === null ? 0 : Math.min(100, Math.round(p * 100))) + '%';
    fill.style.background = STATUS[st].color;
    track.appendChild(fill);
    return track;
  };

  var repOf = function (list) { return list.filter(function (i) { return i.tier === 'Core'; })[0] || list[0]; };

  // ---- control bar ---------------------------------------------------------
  function buildControlBar() {
    var bar = el('div', 'kpi-controlbar');
    bar.appendChild(el('div', 'kpi-controlbar-title', 'Measurement layer'));
    bar.appendChild(makeToggle('Show metrics', state.metricsOn, function (on) { state.metricsOn = on; applyState(); }));
    bar.appendChild(makeToggle('Color by status', state.colorByStatus, function (on) { state.colorByStatus = on; applyState(); }));

    var viewWrap = el('label', 'kpi-select');
    viewWrap.appendChild(el('span', null, 'View'));
    var sel = el('select');
    [['all', 'All rows'], ['core', 'Core KPIs only'], ['attention', 'Behind goal'], ['gaps', 'Unmeasured (gaps)']].forEach(function (o) {
      var opt = el('option', null, o[1]); opt.value = o[0]; sel.appendChild(opt);
    });
    sel.value = state.view;
    sel.onchange = function () { state.view = sel.value; applyState(); };
    viewWrap.appendChild(sel);
    bar.appendChild(viewWrap);

    var legend = el('div', 'kpi-legend');
    Object.keys(STATUS).forEach(function (k) {
      var item = el('span', 'kpi-legend-item');
      var dot = el('span', 'kpi-dot'); dot.style.background = STATUS[k].color;
      item.appendChild(dot); item.appendChild(el('span', null, STATUS[k].label));
      legend.appendChild(item);
    });
    bar.appendChild(legend);

    var scBtn = el('button', 'kpi-scorecard-btn', 'View scorecard');
    scBtn.onclick = openScorecard;
    bar.appendChild(scBtn);

    var mount = document.getElementById(NS) || document.body;
    mount.insertBefore(bar, mount.firstChild);
  }
  function makeToggle(label, initial, onChange) {
    var wrap = el('label', 'kpi-toggle');
    var input = el('input'); input.type = 'checkbox'; input.checked = initial;
    var slider = el('span', 'kpi-toggle-slider');
    input.onchange = function () { onChange(input.checked); };
    wrap.appendChild(input); wrap.appendChild(slider); wrap.appendChild(el('span', 'kpi-toggle-label', label));
    return wrap;
  }

  // ---- card decoration -----------------------------------------------------
  function eachCard(fn) {
    LM_COLUMNS.forEach(function (col) {
      var column = document.getElementById(col.id);
      if (!column) return;
      var cards = column.getElementsByClassName(NS + '-data-wrapper');
      Array.prototype.forEach.call(cards, function (card) {
        var datum = card.getElementsByClassName(NS + '-datum')[0];
        var label = datum ? datum.innerText : '';
        fn(card, label, indicators[norm(label)] || [], col);
      });
    });
  }

  function decorate() {
    eachCard(function (card, label, list) {
      if (card.querySelector('.kpi-badge') || card.querySelector('.kpi-gap')) return;
      card.classList.add('kpi-card');
      if (list.length) {
        var rep = repOf(list), status = rollupStatus(list);
        var badge = el('div', 'kpi-badge');
        var dot = el('span', 'kpi-dot kpi-dot-lg'); dot.style.background = STATUS[status].color;
        badge.appendChild(dot);
        badge.appendChild(el('span', 'kpi-badge-count', list.length + (list.length === 1 ? ' KPI' : ' KPIs')));
        badge.appendChild(progressBar(rep, false));
        var cur = currentPoint(rep);
        if (cur) badge.appendChild(el('span', 'kpi-badge-val', fmtVal(cur.value, rep.unit)));
        var pt = pctText(rep);
        if (pt) badge.appendChild(el('span', 'kpi-badge-pct', pt));
        card.appendChild(badge);
        card.setAttribute('data-kpi-status', status);
        card.style.cursor = 'pointer';
        card.addEventListener('click', function (e) { e.stopPropagation(); openRowModal(label, list); });
      } else {
        card.appendChild(el('div', 'kpi-gap', '⚠ No KPI yet'));
        card.setAttribute('data-kpi-status', 'gap');
      }
    });
  }

  function applyState() {
    var root = document.getElementById(NS);
    if (root) root.classList.toggle('kpi-metrics-on', state.metricsOn);
    if (root) root.classList.toggle('kpi-color-by-status', state.colorByStatus && state.metricsOn);
    eachCard(function (card, label, list) {
      var show = true;
      if (state.metricsOn) {
        if (state.view === 'core') show = list.some(function (i) { return i.tier === 'Core'; });
        else if (state.view === 'gaps') show = list.length === 0;
        else if (state.view === 'attention') show = list.some(function (i) { var s = statusOf(i); return s === 'off-track' || s === 'at-risk'; });
      }
      card.classList.toggle('kpi-hidden', !show);
    });
  }

  // ---- per-row modal -------------------------------------------------------
  function openRowModal(label, list) {
    var overlay = el('div', 'kpi-modal-overlay');
    overlay.onclick = function () { overlay.remove(); };
    var modal = el('div', 'kpi-modal');
    modal.onclick = function (e) { e.stopPropagation(); };
    var close = el('button', 'kpi-modal-close', '×');
    close.onclick = function () { overlay.remove(); };
    modal.appendChild(close);
    modal.appendChild(el('div', 'kpi-modal-eyebrow', 'Logic-model row'));
    modal.appendChild(el('h2', 'kpi-modal-title', label));
    list.forEach(function (ind) { modal.appendChild(renderIndicatorCard(ind)); });
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function renderIndicatorCard(ind) {
    var status = statusOf(ind);
    var card = el('div', 'kpi-ind');
    var head = el('div', 'kpi-ind-head');
    var dot = el('span', 'kpi-dot'); dot.style.background = STATUS[status].color;
    head.appendChild(dot);
    head.appendChild(el('span', 'kpi-ind-name', ind.indicator));
    head.appendChild(el('span', 'kpi-tier ' + (ind.tier === 'Core' ? 'kpi-tier-core' : 'kpi-tier-sec'), ind.tier || ''));
    card.appendChild(head);
    if (ind.definition) card.appendChild(el('div', 'kpi-ind-def', ind.definition));

    // progress toward goal
    card.appendChild(progressBar(ind, true));
    var p = progress(ind), cur = currentPoint(ind), t = targetVal(ind);
    var prog = el('div', 'kpi-ind-progline');
    if (p !== null && cur && t !== null) {
      prog.appendChild(el('span', 'kpi-prog-pct', Math.round(p * 100) + '% to 2026 goal'));
      prog.appendChild(el('span', 'kpi-prog-note', 'current ' + fmtVal(cur.value, ind.unit) + ' of ' + fmtVal(t, ind.unit) + ' goal'));
    } else {
      prog.appendChild(el('span', 'kpi-prog-note', t === null ? 'No 2026 goal set yet' : 'No current value yet'));
    }
    card.appendChild(prog);

    // value cells: Baseline (2018) | 2023 | 2024 | 2025 | Goal (2026)
    var nums = el('div', 'kpi-ind-nums');
    nums.appendChild(numCell('2018 base', fmtVal(ind.baseline, ind.unit)));
    seriesPoints(ind).forEach(function (pt) { nums.appendChild(numCell(String(pt.year), fmtVal(pt.raw, ind.unit))); });
    var goalCell = numCell('2026 goal', fmtVal(ind.target, ind.unit));
    goalCell.classList.add('kpi-num-target');
    nums.appendChild(goalCell);
    card.appendChild(nums);

    var meta = el('div', 'kpi-ind-meta');
    if (ind.source) meta.appendChild(metaRow('Source', ind.source));
    if (ind.frequency) meta.appendChild(metaRow('Cadence', ind.frequency));
    if (ind.owner) meta.appendChild(metaRow('Owner', ind.owner));
    meta.appendChild(metaRow('Status', STATUS[status].label));
    card.appendChild(meta);
    return card;
  }

  function numCell(label, value) {
    var c = el('div', 'kpi-num');
    c.appendChild(el('div', 'kpi-num-val', value));
    c.appendChild(el('div', 'kpi-num-label', label));
    return c;
  }
  function metaRow(k, v) {
    var r = el('div', 'kpi-meta-row');
    r.appendChild(el('span', 'kpi-meta-k', k));
    r.appendChild(el('span', 'kpi-meta-v', v));
    return r;
  }

  // ---- scorecard -----------------------------------------------------------
  function openScorecard() {
    var overlay = el('div', 'kpi-modal-overlay');
    overlay.onclick = function () { overlay.remove(); };
    var modal = el('div', 'kpi-modal kpi-modal-wide');
    modal.onclick = function (e) { e.stopPropagation(); };
    var close = el('button', 'kpi-modal-close', '×');
    close.onclick = function () { overlay.remove(); };
    modal.appendChild(close);
    var pdfBtn = el('button', 'kpi-pdf-btn', 'Download PDF');
    pdfBtn.onclick = function () { downloadScorecardPdf(modal, pdfBtn); };
    modal.appendChild(pdfBtn);
    modal.appendChild(el('h2', 'kpi-modal-title', 'Reach Riverside KPI Scorecard'));

    var totalRows = 0, measured = 0, totalKpis = 0, tally = { 'on-track': 0, 'at-risk': 0, 'off-track': 0, 'no-data': 0 };
    eachCard(function (card, label, list) {
      totalRows++;
      if (list.length) { measured++; totalKpis += list.length; list.forEach(function (i) { tally[statusOf(i)]++; }); }
    });
    var summary = el('div', 'kpi-summary');
    summary.appendChild(summaryStat(measured + ' / ' + totalRows, 'rows measured'));
    summary.appendChild(summaryStat(tally['on-track'], 'on track to goal'));
    summary.appendChild(summaryStat(tally['at-risk'] + tally['off-track'], 'need attention'));
    summary.appendChild(summaryStat(totalKpis, 'indicators tracked'));
    modal.appendChild(summary);

    var YEARS = ['2018', '2023', '2024', '2025', '2026 Goal'];
    LM_COLUMNS.forEach(function (col) {
      var rows = [];
      var column = document.getElementById(col.id);
      if (column) {
        var cards = column.getElementsByClassName(NS + '-data-wrapper');
        Array.prototype.forEach.call(cards, function (card) {
          var datum = card.getElementsByClassName(NS + '-datum')[0];
          var label = datum ? datum.innerText : '';
          (indicators[norm(label)] || []).forEach(function (ind) { rows.push({ row: label, ind: ind }); });
        });
      }
      if (!rows.length) return;
      modal.appendChild(el('h3', 'kpi-sc-colhead', col.label));
      var table = el('table', 'kpi-sc-table');
      var thead = el('tr');
      [''].concat(['Indicator', 'Logic-model row']).concat(YEARS).concat(['Progress', 'Tier']).forEach(function (h) {
        thead.appendChild(el('th', null, h));
      });
      table.appendChild(thead);
      rows.forEach(function (r) {
        var s = statusOf(r.ind);
        var tr = el('tr');
        var dotTd = el('td'); var dot = el('span', 'kpi-dot'); dot.style.background = STATUS[s].color; dotTd.appendChild(dot); tr.appendChild(dotTd);
        tr.appendChild(el('td', 'kpi-sc-ind', r.ind.indicator));
        tr.appendChild(el('td', 'kpi-sc-out', r.row));
        tr.appendChild(el('td', 'kpi-sc-yr', fmtVal(r.ind.baseline, r.ind.unit)));
        var s2 = r.ind.series || {};
        ['2023', '2024', '2025'].forEach(function (y) {
          tr.appendChild(el('td', 'kpi-sc-yr', Object.prototype.hasOwnProperty.call(s2, y) ? fmtVal(s2[y], r.ind.unit) : '—'));
        });
        var goalTd = el('td', 'kpi-sc-yr', fmtVal(r.ind.target, r.ind.unit)); goalTd.style.fontWeight = '700'; tr.appendChild(goalTd);
        var p = progress(r.ind);
        var pTd = el('td', null, p === null ? '—' : Math.round(p * 100) + '%'); pTd.style.color = STATUS[s].color; pTd.style.fontWeight = '700'; tr.appendChild(pTd);
        tr.appendChild(el('td', null, r.ind.tier || ''));
        table.appendChild(tr);
      });
      modal.appendChild(table);
    });
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function downloadScorecardPdf(modal, btn) {
    var h2c = window.html2canvas, jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!h2c || !jsPDFCtor) { alert('PDF libraries failed to load. Check your connection and try again.'); return; }
    var chrome = modal.querySelectorAll('.kpi-modal-close, .kpi-pdf-btn');
    Array.prototype.forEach.call(chrome, function (e) { e.style.visibility = 'hidden'; });
    var origLabel = btn.textContent; btn.disabled = true; btn.textContent = 'Generating…';
    var SCALE = 2;
    h2c(modal, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true })
      .then(function (canvas) {
        var w = canvas.width / SCALE, h = canvas.height / SCALE;
        var pdf = new jsPDFCtor({ orientation: w >= h ? 'l' : 'p', unit: 'px', format: [w, h] });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
        pdf.save('reach-riverside-kpi-scorecard.pdf');
      })
      .catch(function (e) { console.error('[kpi-layer] PDF export failed', e); alert('Sorry, the PDF export failed. See the console for details.'); })
      .then(function () { Array.prototype.forEach.call(chrome, function (e) { e.style.visibility = ''; }); btn.disabled = false; btn.textContent = origLabel; });
  }

  function summaryStat(value, label) {
    var c = el('div', 'kpi-summary-stat');
    c.appendChild(el('div', 'kpi-summary-val', '' + value));
    c.appendChild(el('div', 'kpi-summary-label', label));
    return c;
  }

  // ---- boot ----------------------------------------------------------------
  function waitForColumns(cb) {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var ready = LM_COLUMNS.every(function (c) {
        var col = document.getElementById(c.id);
        return col && col.getElementsByClassName(NS + '-data-wrapper').length > 0;
      });
      if (ready) { clearInterval(timer); cb(); }
      else if (tries > 80) { clearInterval(timer); console.warn('[kpi-layer] logic-model columns not found'); }
    }, 150);
  }
  function init() {
    fetch('./assets/indicators.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var raw = json.indicators || {};
        Object.keys(raw).forEach(function (k) { indicators[norm(k)] = raw[k]; });
        waitForColumns(function () {
          buildControlBar(); decorate(); applyState();
          if (location.hash === '#scorecard') openScorecard();
        });
      })
      .catch(function (e) { console.error('[kpi-layer] failed to load indicators.json', e); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
