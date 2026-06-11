/**
 * kpi-layer.js  —  KPI / measurement overlay for the Reach Riverside logic model.
 *
 * Decoupled prototype: this runs AFTER dashboard.js finishes rendering and
 * *decorates* the existing logic-model cards in the DOM. It does not modify the
 * dashboard's internals, so it can be dropped in or removed cleanly.
 *
 * TIME-SERIES, NEUTRAL model: indicators carry a `series` (year -> value).
 * The data is shown as a small per-year BAR CHART in a single brand color —
 * deliberately NO good/bad coloring, arrows, or trend verdict, because most of
 * these are raw activity counts where a rise or fall needs context the chart
 * can't carry. A `target`, when present, is drawn as a neutral reference line.
 *
 * It adds:
 *   1. A control bar:  Show metrics toggle | View filter | Scorecard
 *   2. A per-year bar chart + latest value on each card that has data
 *   3. A "no KPI yet" marker on logic-model rows with no indicators
 *   4. A per-row detail modal (click a card)
 *   5. A scorecard modal listing every indicator by column, with year columns
 *
 * Data: assets/indicators.json, keyed by exact logic-model row label.
 */
(function () {
  'use strict';

  var NS = 'momentum-dashboard';
  // Logic-model columns the layer decorates: the Outputs column plus the
  // three Outcomes columns (the dashboard's internal ids call all of these
  // "*-outputs", but the rendered labels distinguish Outputs vs Outcomes).
  var LM_COLUMNS = [
    { id: NS + '-outputs', label: 'Outputs' },
    { id: NS + '-immediate-outputs', label: 'Short-term Outcomes' },
    { id: NS + '-intermediate-outputs', label: 'Intermediate Outcomes' },
    { id: NS + '-long-term-outputs', label: 'Long-term Outcomes' },
  ];

  // Single, neutral palette — no performance coloring.
  var BAR = '#3f6fab';       // most-recent year (accent)
  var BAR_DIM = '#c2d4e8';   // prior years
  var DOT = '#1f2a44';       // "measured" marker
  var REF = '#9aa0a6';       // target reference line

  var indicators = {}; // normalized-label -> [indicator, ...]
  var state = { metricsOn: true, view: 'all' }; // view: all | core | gaps

  // ---- helpers -------------------------------------------------------------
  var norm = function (s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  };

  var fmtVal = function (v, unit) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'string' && isNaN(Number(v))) return v; // e.g. "TBD"
    var n = Number(v);
    if (unit === '$') return '$' + n.toLocaleString();
    if (unit === '%') return n + '%';
    return n.toLocaleString();
  };

  // all year points (numeric or not), sorted ascending by year
  var points = function (ind) {
    var s = ind.series || {};
    return Object.keys(s)
      .map(function (y) { return { year: parseInt(y, 10), raw: s[y], value: Number(s[y]) }; })
      .filter(function (p) { return !isNaN(p.year); })
      .sort(function (a, b) { return a.year - b.year; });
  };
  // only points with a usable numeric value
  var numericPoints = function (ind) {
    return points(ind).filter(function (p) { return p.raw !== '' && p.raw != null && !isNaN(p.value); });
  };
  // most recent numeric point, or null
  var latestPoint = function (ind) {
    var n = numericPoints(ind);
    return n.length ? n[n.length - 1] : null;
  };
  // does this indicator's most recent listed year lack a value? (data gap)
  var latestIsGap = function (ind) {
    var pts = points(ind);
    if (!pts.length) return false;
    var p = pts[pts.length - 1];
    return p.raw === '' || p.raw == null || isNaN(p.value);
  };

  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // neutral per-year bar chart. Reserves a slot per listed year (so TBD/missing
  // years leave a gap); the most recent year with data is the accent bar.
  var barChart = function (ind, w, h) {
    var svg = svgEl('svg', {
      'class': 'kpi-chart', width: w, height: h,
      viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none'
    });
    var pts = points(ind);
    if (!pts.length) return svg;
    var nums = numericPoints(ind);
    var maxVal = nums.length ? Math.max.apply(null, nums.map(function (p) { return p.value; })) : 0;
    var scaleMax = Math.max(maxVal, (ind.target != null ? Number(ind.target) : 0)) || 1;
    var n = pts.length;
    var gap = Math.max(2, w * 0.04);
    var bw = (w - gap * (n + 1)) / n;
    var latest = latestPoint(ind);

    pts.forEach(function (p, i) {
      var x = gap + i * (bw + gap);
      if (p.raw === '' || p.raw == null || isNaN(p.value)) return; // missing/TBD slot left empty
      var bh = Math.max(2, (p.value / scaleMax) * (h - 2));
      var isLatest = latest && p.year === latest.year;
      svg.appendChild(svgEl('rect', {
        x: x, y: h - bh, width: bw, height: bh, rx: 1.5,
        fill: isLatest ? BAR : BAR_DIM
      }));
    });

    // optional target reference line (neutral, dashed)
    if (ind.target != null && !isNaN(Number(ind.target))) {
      var ty = h - Math.max(1, (Number(ind.target) / scaleMax) * (h - 2));
      svg.appendChild(svgEl('line', {
        x1: 0, y1: ty, x2: w, y2: ty, stroke: REF,
        'stroke-width': 1, 'stroke-dasharray': '3 2', 'vector-effect': 'non-scaling-stroke'
      }));
    }
    return svg;
  };

  // representative indicator for the compact card badge
  var repOf = function (list) {
    return list.filter(function (i) { return i.tier === 'Core'; })[0] || list[0];
  };

  // ---- control bar ---------------------------------------------------------
  function buildControlBar() {
    var bar = el('div', 'kpi-controlbar');

    bar.appendChild(el('div', 'kpi-controlbar-title', 'Measurement layer'));

    bar.appendChild(makeToggle('Show metrics', state.metricsOn, function (on) {
      state.metricsOn = on;
      applyState();
    }));

    // view filter
    var viewWrap = el('label', 'kpi-select');
    viewWrap.appendChild(el('span', null, 'View'));
    var sel = el('select');
    [['all', 'All rows'], ['core', 'Core KPIs only'], ['gaps', 'Unmeasured (gaps)']].forEach(function (o) {
      var opt = el('option', null, o[1]); opt.value = o[0]; sel.appendChild(opt);
    });
    sel.value = state.view;
    sel.onchange = function () { state.view = sel.value; applyState(); };
    viewWrap.appendChild(sel);
    bar.appendChild(viewWrap);

    // neutral legend: what the bars mean
    var legend = el('div', 'kpi-legend');
    var li = el('span', 'kpi-legend-item');
    var sw1 = el('span', 'kpi-swatch'); sw1.style.background = BAR_DIM; li.appendChild(sw1);
    var sw2 = el('span', 'kpi-swatch'); sw2.style.background = BAR; li.appendChild(sw2);
    li.appendChild(el('span', null, 'value per year (latest darker)'));
    legend.appendChild(li);
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
    wrap.appendChild(input);
    wrap.appendChild(slider);
    wrap.appendChild(el('span', 'kpi-toggle-label', label));
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
        var list = indicators[norm(label)] || [];
        fn(card, label, list, col);
      });
    });
  }

  function decorate() {
    eachCard(function (card, label, list) {
      if (card.querySelector('.kpi-badge') || card.querySelector('.kpi-gap')) return; // once
      card.classList.add('kpi-card');

      if (list.length) {
        var rep = repOf(list);
        var badge = el('div', 'kpi-badge');

        var dot = el('span', 'kpi-dot kpi-dot-lg');
        dot.style.background = DOT;
        badge.appendChild(dot);

        badge.appendChild(el('span', 'kpi-badge-count', list.length + (list.length === 1 ? ' KPI' : ' KPIs')));

        badge.appendChild(barChart(rep, 58, 22));

        var lp = latestPoint(rep);
        if (lp) badge.appendChild(el('span', 'kpi-badge-val', fmtVal(lp.value, rep.unit)));

        card.appendChild(badge);
        card.setAttribute('data-kpi-status', 'measured');
        card.style.cursor = 'pointer';
        card.addEventListener('click', function (e) {
          e.stopPropagation();
          openRowModal(label, list);
        });
      } else {
        card.appendChild(el('div', 'kpi-gap', '⚠ No KPI yet'));
        card.setAttribute('data-kpi-status', 'gap');
      }
    });
  }

  // ---- apply current toggle/filter state to the DOM ------------------------
  function applyState() {
    var root = document.getElementById(NS);
    if (root) root.classList.toggle('kpi-metrics-on', state.metricsOn);

    eachCard(function (card, label, list) {
      var show = true;
      if (state.metricsOn) {
        if (state.view === 'core') show = list.some(function (i) { return i.tier === 'Core'; });
        else if (state.view === 'gaps') show = list.length === 0;
      }
      if (show) card.classList.remove('kpi-hidden');
      else card.classList.add('kpi-hidden');
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
    var card = el('div', 'kpi-ind');

    var head = el('div', 'kpi-ind-head');
    var dot = el('span', 'kpi-dot'); dot.style.background = DOT;
    head.appendChild(dot);
    head.appendChild(el('span', 'kpi-ind-name', ind.indicator));
    head.appendChild(el('span', 'kpi-tier ' + (ind.tier === 'Core' ? 'kpi-tier-core' : 'kpi-tier-sec'), ind.tier || ''));
    card.appendChild(head);

    if (ind.definition) card.appendChild(el('div', 'kpi-ind-def', ind.definition));

    var chart = barChart(ind, 240, 64);
    chart.classList.add('kpi-chart-lg');
    card.appendChild(chart);

    // one value cell per listed year, plus a target cell if present
    var nums = el('div', 'kpi-ind-nums');
    points(ind).forEach(function (p) {
      nums.appendChild(numCell(String(p.year), fmtVal(p.raw, ind.unit)));
    });
    if (ind.target !== null && ind.target !== undefined) {
      var tcell = numCell('Target', fmtVal(ind.target, ind.unit));
      tcell.classList.add('kpi-num-target');
      nums.appendChild(tcell);
    }
    card.appendChild(nums);

    var meta = el('div', 'kpi-ind-meta');
    if (ind.source) meta.appendChild(metaRow('Source', ind.source));
    if (ind.frequency) meta.appendChild(metaRow('Cadence', ind.frequency));
    if (ind.owner) meta.appendChild(metaRow('Owner', ind.owner));
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

  // ---- scorecard modal -----------------------------------------------------
  function allYears() {
    var set = {};
    Object.keys(indicators).forEach(function (k) {
      indicators[k].forEach(function (ind) {
        points(ind).forEach(function (p) { set[p.year] = 1; });
      });
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

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

    modal.appendChild(el('h2', 'kpi-modal-title', 'Reach Riverside Data Scorecard'));

    var years = allYears();

    // coverage summary (neutral, data-availability framed)
    var totalRows = 0, measured = 0, totalKpis = 0, dataGaps = 0;
    eachCard(function (card, label, list) {
      totalRows++;
      if (list.length) {
        measured++; totalKpis += list.length;
        list.forEach(function (i) { if (latestIsGap(i)) dataGaps++; });
      }
    });
    var summary = el('div', 'kpi-summary');
    summary.appendChild(summaryStat(measured + ' / ' + totalRows, 'rows measured'));
    summary.appendChild(summaryStat(totalKpis, 'indicators tracked'));
    summary.appendChild(summaryStat(totalRows ? Math.round((measured / totalRows) * 100) + '%' : '—', 'coverage'));
    summary.appendChild(summaryStat(dataGaps, 'latest year pending'));
    modal.appendChild(summary);

    LM_COLUMNS.forEach(function (col) {
      var rows = [];
      var column = document.getElementById(col.id);
      if (column) {
        var cards = column.getElementsByClassName(NS + '-data-wrapper');
        Array.prototype.forEach.call(cards, function (card) {
          var datum = card.getElementsByClassName(NS + '-datum')[0];
          var label = datum ? datum.innerText : '';
          var list = indicators[norm(label)] || [];
          list.forEach(function (ind) { rows.push({ row: label, ind: ind }); });
        });
      }
      if (!rows.length) return;
      modal.appendChild(el('h3', 'kpi-sc-colhead', col.label));
      var table = el('table', 'kpi-sc-table');
      var thead = el('tr');
      [''].concat(['Indicator', 'Logic-model row']).concat(years.map(String)).concat(['Tier']).forEach(function (h) {
        thead.appendChild(el('th', null, h));
      });
      table.appendChild(thead);
      rows.forEach(function (r) {
        var tr = el('tr');
        var dotTd = el('td');
        var dot = el('span', 'kpi-dot'); dot.style.background = DOT; dotTd.appendChild(dot);
        tr.appendChild(dotTd);
        tr.appendChild(el('td', 'kpi-sc-ind', r.ind.indicator));
        tr.appendChild(el('td', 'kpi-sc-out', r.row));
        var series = r.ind.series || {};
        years.forEach(function (y) {
          var has = Object.prototype.hasOwnProperty.call(series, String(y));
          tr.appendChild(el('td', 'kpi-sc-yr', has ? fmtVal(series[String(y)], r.ind.unit) : '—'));
        });
        tr.appendChild(el('td', null, r.ind.tier || ''));
        table.appendChild(tr);
      });
      modal.appendChild(table);
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // ---- PDF export ----------------------------------------------------------
  function downloadScorecardPdf(modal, btn) {
    var h2c = window.html2canvas;
    var jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!h2c || !jsPDFCtor) {
      alert('PDF libraries failed to load. Check your connection and try again.');
      return;
    }

    var chrome = modal.querySelectorAll('.kpi-modal-close, .kpi-pdf-btn');
    Array.prototype.forEach.call(chrome, function (e) { e.style.visibility = 'hidden'; });

    var origLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generating…';

    var SCALE = 2;
    h2c(modal, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true })
      .then(function (canvas) {
        var w = canvas.width / SCALE;
        var h = canvas.height / SCALE;
        var pdf = new jsPDFCtor({ orientation: w >= h ? 'l' : 'p', unit: 'px', format: [w, h] });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
        pdf.save('reach-riverside-data-scorecard.pdf');
      })
      .catch(function (e) {
        console.error('[kpi-layer] PDF export failed', e);
        alert('Sorry, the PDF export failed. See the console for details.');
      })
      .then(function () {
        Array.prototype.forEach.call(chrome, function (e) { e.style.visibility = ''; });
        btn.disabled = false;
        btn.textContent = origLabel;
      });
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
    fetch('./assets/indicators.json')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var raw = json.indicators || {};
        Object.keys(raw).forEach(function (k) { indicators[norm(k)] = raw[k]; });
        waitForColumns(function () {
          buildControlBar();
          decorate();
          applyState();
          if (location.hash === '#scorecard') openScorecard();
        });
      })
      .catch(function (e) { console.error('[kpi-layer] failed to load indicators.json', e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
