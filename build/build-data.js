/**
 * build-data.js
 * Freezes the live Reach Riverside logic-model Google Sheet into a local
 * assets/data.json, in the exact shape the dashboard's data-loader produces.
 *
 * This mirrors data-loader.js so the frozen local data renders identically to
 * the live site. Run with:  node build/build-data.js
 *
 * To refresh from the sheet:
 *   curl -sL "https://docs.google.com/spreadsheets/d/1olavg1cfmkW75MrPcuRftWsEBcfIf7mzKX7vcaNdV6E/export?format=csv&gid=1442531113" -o build/reach_model.csv
 *   node build/build-data.js
 */
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'reach_model.csv');
const OUT_PATH = path.join(__dirname, '..', 'assets', 'data.json');

// --- CSV parser copied verbatim from assets/data-loader.js -----------------
function parseCSV(csvText) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  while (i < csvText.length) {
    const char = csvText[i];
    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
    i++;
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) rows.push(currentRow);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.replace(/"/g, '').trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = (row[index] || '').replace(/"/g, '').trim();
    });
    return obj;
  });
}

const arrayify = (s) =>
  (s || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

const getUnique = (data, key) => [
  ...new Set(data.map((row) => arrayify(row[key])).flat()),
];

// --- Build (mirrors data-loader.js transformation) -------------------------
const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/\r\n/g, '\n');
const model = parseCSV(raw);
const has = (k) => model.length > 0 && model[0].hasOwnProperty(k);

const inputs = has('Inputs') ? getUnique(model, 'Inputs') : [];
const pbcComponents = has('PBC Component') ? getUnique(model, 'PBC Component') : [];
const partners = has('Partners') ? getUnique(model, 'Partners') : [];
const outputs = has('Output') ? getUnique(model, 'Output') : [];
const immediateOutputs = has('Immediate Outcomes') ? getUnique(model, 'Immediate Outcomes') : [];
const intermediateOutputs = has('Intermediate Outcomes') ? getUnique(model, 'Intermediate Outcomes') : [];
const longTermOutputs = has('Long-term Outcomes') ? getUnique(model, 'Long-term Outcomes') : [];

const strategies = Object.fromEntries(
  model.map((row) => [
    row.Strategy.trim(),
    {
      label: row.Strategy,
      details: row['Paragraph description'] || row['Description'] || '',
      activities: row['Activities'] || '',
      outputs: has('Output') ? arrayify(row.Output).map((o) => outputs.indexOf(o)) : [],
      immediateOutputs: has('Immediate Outcomes') ? arrayify(row['Immediate Outcomes']).map((o) => immediateOutputs.indexOf(o)) : [],
      intermediateOutputs: has('Intermediate Outcomes') ? arrayify(row['Intermediate Outcomes']).map((o) => intermediateOutputs.indexOf(o)) : [],
      longTermOutputs: has('Long-term Outcomes') ? arrayify(row['Long-term Outcomes']).map((o) => longTermOutputs.indexOf(o)) : [],
      partners: has('Partners') ? arrayify(row.Partners).map((p) => partners.indexOf(p)) : [],
      pbcComponents: has('PBC Component') ? arrayify(row['PBC Component'] || '').map((c) => pbcComponents.indexOf(c)) : [],
      research: [],
    },
  ])
);

const data = {
  headerTooltips: [
    'Place-Based Community Components',
    'Key organizations, institutions, government entities, funders, and other stakeholders collaborating on initiatives',
    'Grouped approaches that organize multiple related activities into coherent intervention areas',
    'Evidence that directly demonstrates an activity occurred as planned',
    'Preliminary results that directly follow outputs, representing initial changes in opportunities, capacity, and incentives among target populations and community systems',
    'Changes that build upon short-term outcomes, representing shifts in behaviors and community conditions',
    "Sustained, transformational changes in community conditions and quality of life that represent the strategy's ultimate goals",
  ],
  inputs,
  inputTooltips: inputs,
  pbcComponents,
  strategies,
  partners,
  outputs,
  immediateOutputs,
  intermediateOutputs,
  longTermOutputs,
  impactGoal: has('Impact Goal') ? (model.find((r) => r['Impact Goal'])?.['Impact Goal'] || '') : '',
};

fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 2));

// --- Report ----------------------------------------------------------------
console.log('Wrote', OUT_PATH);
console.log('\nstrategies:', Object.keys(strategies).length);
console.log('partners  :', partners.length);
console.log('\n=== SHORT-TERM (Immediate) OUTCOMES ===');
immediateOutputs.forEach((o, i) => console.log(`${i}. ${o}`));
console.log('\n=== INTERMEDIATE OUTCOMES ===');
intermediateOutputs.forEach((o, i) => console.log(`${i}. ${o}`));
console.log('\n=== LONG-TERM OUTCOMES ===');
longTermOutputs.forEach((o, i) => console.log(`${i}. ${o}`));
