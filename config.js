// Dashboard Configuration — LOCAL PROTOTYPE
// Everything runs from frozen local data (no live Google Sheets calls).
window.DASHBOARD_CONFIG = {
  ASSETS_PATH: './assets',

  // Use the frozen local assets/data.json instead of Google Sheets.
  USE_LIVE_GOOGLE_SHEETS: false,
  CACHE_DURATION: 0,

  // Kept for reference only (not used while USE_LIVE_GOOGLE_SHEETS is false).
  // To refresh the frozen data: re-run build/build-data.js after downloading the sheet.
  GOOGLE_SHEET_ID: '1olavg1cfmkW75MrPcuRftWsEBcfIf7mzKX7vcaNdV6E',
  SHEET_GIDS: { logic_model_expanded: '1442531113' }
};
