/**
 * kpi-layer.js  —  KPI / measurement overlay for the Reach Riverside logic model.
 *
 * Decoupled prototype: this runs AFTER dashboard.js finishes rendering and
 * *decorates* the existing outcome cards in the DOM. It does not modify the
 * dashboard's internals, so it can be dropped in or removed cleanly.
 *
 * It adds:
 *   1. A control bar:  Show metrics toggle | Color by status | View filter | Scorecard
 *   2. Status dot + baseline→target progress bar on each outcome card that has KPIs
 *   3. A "no KPI yet" gap marker on outcome cards with no indicators
 *   4. A per-outcome KPI detail modal (click an outcome card)
 *   5. A scorecard modal listing every KPI grouped by outcome column
 *
 * Data: assets/indicators.json, keyed by exact outcome label.
 */
(function () {
  'use strict';

  var NS = 'momentum-dashboard';
  var OUTCOME_COLUMNS = [
    { id: NS + '-immediate-outputs', label: 'Short-term Outcomes' },
    { id: NS + '-intermediate-outputs', label: 'Intermediate Outcomes' },
    { id: NS + '-long-term-outputs', label: 'Long-term Outcomes' },
  ];

  var STATUS = {
    'on-track': { color: '#2e8b57', label: 'On track' },
    'at-risk': { color: '#e0a200', label: 'At risk' },
    'off-track': { color: '#d9534f', label: 'Off track' },
    'no-data': { color: '#9aa0a6', label: 'No data' },
  };
  var STATUS_RANK = { 'off-track': 3, 'at-risk': 2, 'on-track': 1, 'no-data': 0 };

  var indicators = {}; // normalized-label -> [indicator, ...]
  var state = { metricsOn: true, colorByStatus: false, view: 'all' }; // view: all | core | gaps

  // ---- helpers -------------------------------------------------------------
  var norm = function (s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  };

  var fmtVal = function (v, unit) {
    if (v === null || v === undefined || v === '') return '—';
    if (unit === '$') return '$' + Number(v).toLocaleString();
    if (unit === '%') return v + '%';
    return Number(v).toLocaleString();
  };

  // progress fraction from baseline -> target, respecting direction
  var progress = function (ind) {
    var b = Number(ind.baseline), t = Number(ind.target), c = Number(ind.current);
    if (isNaN(b) || isNaN(t) || isNaN(c) || t === b) return null;
    var p = ind.direction === 'down' ? (b - c) / (b - t) : (c - b) / (t - b);
    return Math.max(0, Math.min(1.05, p));
  };

  // status: explicit if present, else derived from progress
  var statusOf = function (ind) {
    if (ind.status && STATUS[ind.status]) return ind.status;
    var p = progress(ind);
    if (p === null) return 'no-data';
    if (p >= 0.67) return 'on-track';
    if (p >= 0.34) return 'at-risk';
    return 'off-track';
  };

  // worst status across an outcome's indicators (drives the card dot)
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

  // ---- control bar ---------------------------------------------------------
  function buildControlBar() {
    var bar = el('div', 'kpi-controlbar');

    var title = el('div', 'kpi-controlbar-title', 'Measurement layer');
    bar.appendChild(title);

    bar.appendChild(makeToggle('Show metrics', state.metricsOn, function (on) {
      state.metricsOn = on;
      applyState();
    }));

    bar.appendChild(makeToggle('Color by status', state.colorByStatus, function (on) {
      state.colorByStatus = on;
      applyState();
    }));

    // view filter
    var viewWrap = el('label', 'kpi-select');
    viewWrap.appendChild(el('span', null, 'View'));
    var sel = el('select');
    [['all', 'All outcomes'], ['core', 'Core KPIs only'], ['gaps', 'Unmeasured (gaps)']].forEach(function (o) {
      var opt = el('option', null, o[1]); opt.value = o[0]; sel.appendChild(opt);
    });
    sel.value = state.view;
    sel.onchange = function () { state.view = sel.value; applyState(); };
    viewWrap.appendChild(sel);
    bar.appendChild(viewWrap);

    // legend
    var legend = el('div', 'kpi-legend');
    Object.keys(STATUS).forEach(function (k) {
      var item = el('span', 'kpi-legend-item');
      var dot = el('span', 'kpi-dot'); dot.style.background = STATUS[k].color;
      item.appendChild(dot); item.appendChild(el('span', null, STATUS[k].label));
      legend.appendChild(item);
    });
    bar.appendChild(legend);

    // scorecard button
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
  // returns list of {wrapper, label, list}
  function eachOutcomeCard(fn) {
    OUTCOME_COLUMNS.forEach(function (col) {
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
    eachOutcomeCard(function (card, label, list) {
      if (card.querySelector('.kpi-badge') || card.querySelector('.kpi-gap')) return; // once
      card.classList.add('kpi-card');

      if (list.length) {
        var status = rollupStatus(list);
        var badge = el('div', 'kpi-badge');

        var dot = el('span', 'kpi-dot kpi-dot-lg');
        dot.style.background = STATUS[status].color;
        badge.appendChild(dot);

        var count = el('span', 'kpi-badge-count', list.length + (list.length === 1 ? ' KPI' : ' KPIs'));
        badge.appendChild(count);

        // mini progress bar = avg progress of the outcome's indicators
        var ps = list.map(progress).filter(function (p) { return p !== null; });
        if (ps.length) {
          var avg = ps.reduce(function (a, b) { return a + b; }, 0) / ps.length;
          var track = el('div', 'kpi-bar-track');
          var fill = el('div', 'kpi-bar-fill');
          fill.style.width = Math.min(100, Math.round(avg * 100)) + '%';
          fill.style.background = STATUS[status].color;
          track.appendChild(fill);
          badge.appendChild(track);
        }
        card.appendChild(badge);
        card.setAttribute('data-kpi-status', status);

        card.style.cursor = 'pointer';
        card.addEventListener('click', function (e) {
          e.stopPropagation();
          openOutcomeModal(label, list);
        });
      } else {
        var gap = el('div', 'kpi-gap', '⚠ No KPI yet');
        card.appendChild(gap);
        card.setAttribute('data-kpi-status', 'gap');
      }
    });
  }

  // ---- apply current toggle/filter state to the DOM ------------------------
  function applyState() {
    var root = document.getElementById(NS);
    if (root) root.classList.toggle('kpi-metrics-on', state.metricsOn);
    if (root) root.classList.toggle('kpi-color-by-status', state.colorByStatus && state.metricsOn);

    eachOutcomeCard(function (card, label, list) {
      var holder = card.parentElement || card; // the wrapperDiv that controls layout
      var show = true;
      if (state.metricsOn) {
        if (state.view === 'core') show = list.some(function (i) { return i.tier === 'Core'; });
        else if (state.view === 'gaps') show = list.length === 0;
      }
      // Respect any existing dashboard filtering: only re-hide, never force-show
      // something the dashboard hid. We track our own hide with a class.
      if (show) card.classList.remove('kpi-hidden');
      else card.classList.add('kpi-hidden');
    });
  }

  // ---- per-outcome modal ---------------------------------------------------
  function openOutcomeModal(label, list) {
    var overlay = el('div', 'kpi-modal-overlay');
    overlay.onclick = function () { overlay.remove(); };
    var modal = el('div', 'kpi-modal');
    modal.onclick = function (e) { e.stopPropagation(); };

    var close = el('button', 'kpi-modal-close', '×');
    close.onclick = function () { overlay.remove(); };
    modal.appendChild(close);

    modal.appendChild(el('div', 'kpi-modal-eyebrow', 'Outcome'));
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
    var tier = el('span', 'kpi-tier ' + (ind.tier === 'Core' ? 'kpi-tier-core' : 'kpi-tier-sec'), ind.tier || '');
    head.appendChild(tier);
    card.appendChild(head);

    if (ind.definition) card.appendChild(el('div', 'kpi-ind-def', ind.definition));

    // baseline -> current -> target bar
    var p = progress(ind);
    var track = el('div', 'kpi-bar-track kpi-bar-lg');
    var fill = el('div', 'kpi-bar-fill');
    fill.style.width = (p === null ? 0 : Math.min(100, Math.round(p * 100))) + '%';
    fill.style.background = STATUS[status].color;
    track.appendChild(fill);
    card.appendChild(track);

    var nums = el('div', 'kpi-ind-nums');
    nums.appendChild(numCell('Baseline', fmtVal(ind.baseline, ind.unit)));
    nums.appendChild(numCell('Current', fmtVal(ind.current, ind.unit), STATUS[status].color));
    nums.appendChild(numCell('Target', fmtVal(ind.target, ind.unit)));
    card.appendChild(nums);

    var meta = el('div', 'kpi-ind-meta');
    if (ind.source) meta.appendChild(metaRow('Source', ind.source));
    if (ind.frequency) meta.appendChild(metaRow('Cadence', ind.frequency));
    if (ind.owner) meta.appendChild(metaRow('Owner', ind.owner));
    meta.appendChild(metaRow('Status', STATUS[status].label));
    card.appendChild(meta);

    return card;
  }

  function numCell(label, value, color) {
    var c = el('div', 'kpi-num');
    var v = el('div', 'kpi-num-val', value);
    if (color) v.style.color = color;
    c.appendChild(v);
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

    // coverage summary
    var totalOutcomes = 0, measured = 0, totalKpis = 0, statusTally = { 'on-track': 0, 'at-risk': 0, 'off-track': 0, 'no-data': 0 };
    eachOutcomeCard(function (card, label, list) {
      totalOutcomes++;
      if (list.length) { measured++; totalKpis += list.length; list.forEach(function (i) { statusTally[statusOf(i)]++; }); }
    });
    var summary = el('div', 'kpi-summary');
    summary.appendChild(summaryStat(measured + ' / ' + totalOutcomes, 'outcomes measured'));
    summary.appendChild(summaryStat(totalKpis, 'KPIs defined'));
    summary.appendChild(summaryStat(Math.round((measured / totalOutcomes) * 100) + '%', 'coverage'));
    summary.appendChild(summaryStat(statusTally['off-track'] + statusTally['at-risk'], 'need attention'));
    modal.appendChild(summary);

    OUTCOME_COLUMNS.forEach(function (col) {
      var rows = [];
      var column = document.getElementById(col.id);
      if (column) {
        var cards = column.getElementsByClassName(NS + '-data-wrapper');
        Array.prototype.forEach.call(cards, function (card) {
          var datum = card.getElementsByClassName(NS + '-datum')[0];
          var label = datum ? datum.innerText : '';
          var list = indicators[norm(label)] || [];
          list.forEach(function (ind) { rows.push({ outcome: label, ind: ind }); });
        });
      }
      if (!rows.length) return;
      modal.appendChild(el('h3', 'kpi-sc-colhead', col.label));
      var table = el('table', 'kpi-sc-table');
      var thead = el('tr');
      ['', 'Indicator', 'Outcome', 'Baseline', 'Current', 'Target', 'Tier'].forEach(function (h) {
        thead.appendChild(el('th', null, h));
      });
      table.appendChild(thead);
      rows.forEach(function (r) {
        var s = statusOf(r.ind);
        var tr = el('tr');
        var dotTd = el('td');
        var dot = el('span', 'kpi-dot'); dot.style.background = STATUS[s].color; dotTd.appendChild(dot);
        tr.appendChild(dotTd);
        tr.appendChild(el('td', 'kpi-sc-ind', r.ind.indicator));
        tr.appendChild(el('td', 'kpi-sc-out', r.outcome));
        tr.appendChild(el('td', null, fmtVal(r.ind.baseline, r.ind.unit)));
        var cur = el('td', null, fmtVal(r.ind.current, r.ind.unit)); cur.style.color = STATUS[s].color; cur.style.fontWeight = '700';
        tr.appendChild(cur);
        tr.appendChild(el('td', null, fmtVal(r.ind.target, r.ind.unit)));
        tr.appendChild(el('td', null, r.ind.tier || ''));
        table.appendChild(tr);
      });
      modal.appendChild(table);
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // ---- PDF export ----------------------------------------------------------
  // Snapshots the scorecard modal exactly as rendered and saves it as a
  // single, pixel-matched PDF page (uses html2canvas + jsPDF from index.html).
  function downloadScorecardPdf(modal, btn) {
    var h2c = window.html2canvas;
    var jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!h2c || !jsPDFCtor) {
      alert('PDF libraries failed to load. Check your connection and try again.');
      return;
    }

    // Hide the on-screen-only controls so they don't appear in the PDF.
    // Both are absolutely positioned, so hiding them leaves no layout gap.
    var chrome = modal.querySelectorAll('.kpi-modal-close, .kpi-pdf-btn');
    Array.prototype.forEach.call(chrome, function (e) { e.style.visibility = 'hidden'; });

    var origLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generating…';

    var SCALE = 2; // crisp on retina / when printed
    h2c(modal, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true })
      .then(function (canvas) {
        var w = canvas.width / SCALE;   // back to CSS px
        var h = canvas.height / SCALE;
        var pdf = new jsPDFCtor({ orientation: w >= h ? 'l' : 'p', unit: 'px', format: [w, h] });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
        pdf.save('reach-riverside-kpi-scorecard.pdf');
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
      var ready = OUTCOME_COLUMNS.every(function (c) {
        var col = document.getElementById(c.id);
        return col && col.getElementsByClassName(NS + '-data-wrapper').length > 0;
      });
      if (ready) { clearInterval(timer); cb(); }
      else if (tries > 80) { clearInterval(timer); console.warn('[kpi-layer] outcome columns not found'); }
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
          // Deep links: #scorecard opens the scorecard on load.
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
