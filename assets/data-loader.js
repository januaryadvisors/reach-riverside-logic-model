/**
 * Data loading and processing module for the dashboard
 * Handles Google Sheets integration, CSV parsing, and data transformation
 */
window.DataLoader = (function() {

    /**
     * Loads and processes data from Google Sheets or local fallback
     * @param {Object} dashboardWrapper - DOM element for loading indicators
     * @param {Function} createElement - Function to create DOM elements with namespace
     * @param {string} namespace - CSS namespace for the dashboard
     * @returns {Promise<Object>} Processed data object
     */
    const loadData = async (dashboardWrapper, createElement, namespace) => {
      try {
        // Use external configuration
        const CONFIG = window.DASHBOARD_CONFIG || {
          USE_LIVE_GOOGLE_SHEETS: false,
          CACHE_DURATION: 0
        };
  
        // Clear all cache for debugging
        console.log('🗑️ Clearing all cached data for debugging');
        localStorage.clear();
        
        const now = Date.now();
        
        if (CONFIG.USE_LIVE_GOOGLE_SHEETS) {
          // Add loading indicator
          const loadingDiv = createElement(dashboardWrapper, 'div', 'loading');
          loadingDiv.style.textAlign = 'center';
          loadingDiv.style.padding = '40px';
          loadingDiv.style.fontSize = '18px';
          loadingDiv.innerText = 'Loading fresh data from Google Sheets...';
  
          // Function to fetch and parse CSV
          const fetchCSV = async (gid) => {
            const url = `https://docs.google.com/spreadsheets/d/${CONFIG.GOOGLE_SHEET_ID}/export?format=csv&gid=${gid}`;
            console.log(`🌐 Fetching sheet gid ${gid}: ${url}`);
            
            try {
              const response = await fetch(url);
              console.log(`📡 Response status for gid ${gid}:`, response.status, response.statusText);
              console.log(`📡 Response headers for gid ${gid}:`, [...response.headers.entries()]);
              console.log(`📡 Response URL for gid ${gid}:`, response.url);
              
              if (!response.ok) {
                console.error(`❌ Bad response for gid ${gid}:`, response.status, response.statusText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              const text = await response.text();
              console.log(`✅ Successfully fetched gid ${gid}, data length:`, text.length);
              console.log(`📄 First 200 chars of gid ${gid}:`, text.substring(0, 200));
              
              // Check if we got redirected to a login page
              if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
                console.error(`❌ gid ${gid} returned login page - sheet may not be public`);
                throw new Error('Redirected to login page - sheet not public');
              }
              
              // Check if we got HTML instead of CSV
              if (text.trim().startsWith('<')) {
                console.error(`❌ gid ${gid} returned HTML instead of CSV`);
                console.log(`🔍 HTML content:`, text.substring(0, 500));
                throw new Error('Received HTML instead of CSV - check sheet permissions');
              }
              
              return text;
            } catch (fetchError) {
              console.error(`❌ Fetch error for gid ${gid}:`, fetchError);
              throw fetchError;
            }
          };
  
          // Fetch only the logic model expanded sheet
          const modelRaw = await fetchCSV(CONFIG.SHEET_GIDS.logic_model_expanded);
          // Improved CSV parser to handle multiline fields
          const parseCSV = (csvText) => {
            const rows = [];
            let currentRow = [];
            let currentField = '';
            let inQuotes = false;
            let i = 0;
            
            while (i < csvText.length) {
              const char = csvText[i];
              
              if (char === '"') {
                if (inQuotes && csvText[i + 1] === '"') {
                  // Handle escaped quotes ""
                  currentField += '"';
                  i++; // Skip next quote
                } else {
                  // Toggle quote state
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                // End of field
                currentRow.push(currentField.trim());
                currentField = '';
              } else if (char === '\n' && !inQuotes) {
                // End of row
                currentRow.push(currentField.trim());
                if (currentRow.some(field => field.length > 0)) {
                  rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
              } else {
                // Regular character (including newlines inside quotes)
                currentField += char;
              }
              i++;
            }
            
            // Handle last field/row
            if (currentField || currentRow.length > 0) {
              currentRow.push(currentField.trim());
              if (currentRow.some(field => field.length > 0)) {
                rows.push(currentRow);
              }
            }
            
            if (rows.length === 0) return [];
            
            const headers = rows[0].map(h => h.replace(/"/g, '').trim());
            
            return rows.slice(1).map(row => {
              const obj = {};
              headers.forEach((header, index) => {
                obj[header] = (row[index] || '').replace(/"/g, '').trim();
              });
              return obj;
            });
          };
  
  
          // Parse the CSV data
          const model = parseCSV(modelRaw);
  
          console.log('🗃️ PARSED LOGIC MODEL DATA:');
          console.log('📝 Number of rows:', model.length);
          console.log('🏷️ Column headers:', Object.keys(model[0] || {}));
          console.log('📋 First 3 rows of parsed data:');
          model.slice(0, 3).forEach((row, i) => {
            console.log(`Row ${i + 1}:`, row);
          });
  
          // 🔍 DEBUG: Check Activities column specifically
          console.log('\n🎯 Activities column data:');
          model.slice(0, 3).forEach((row, i) => {
            console.log(`Strategy "${row.Strategy}" -> Activities: "${row.Activities}"`);
          });
          
          // Check specifically for PBC Components column
          if (model.length > 0) {
            const hasPBCColumn = Object.keys(model[0]).find(key => 
              key.toLowerCase().includes('pbc') || key.toLowerCase().includes('component')
            );
          }
  
          // Helper functions from parseData.js
          const arrayify = multilineRow => {
            return multilineRow
              .split('\n')
              .map(item => item.trim())
              .filter(item => item);
          };
  
          const getUnique = (data, key) => {
            return [...new Set(data.map(row => arrayify(row[key])).flat())];
          };
  
          // Extract unique values with fallbacks for missing columns
          const inputs = model.length > 0 && model[0].hasOwnProperty('Inputs') ? getUnique(model, 'Inputs') : [];
          const pbcComponents = model.length > 0 && model[0].hasOwnProperty('PBC Component') ? getUnique(model, 'PBC Component') : [];
          const partners = model.length > 0 && model[0].hasOwnProperty('Partners') ? getUnique(model, 'Partners') : [];
          const outputs = model.length > 0 && model[0].hasOwnProperty('Output') ? getUnique(model, 'Output') : [];
          const immediateOutputs = model.length > 0 && model[0].hasOwnProperty('Immediate Outcomes') ? getUnique(model, 'Immediate Outcomes') : [];
          const intermediateOutputs = model.length > 0 && model[0].hasOwnProperty('Intermediate Outcomes') ? getUnique(model, 'Intermediate Outcomes') : [];
          const longTermOutputs = model.length > 0 && model[0].hasOwnProperty('Long-term Outcomes') ? getUnique(model, 'Long-term Outcomes') : [];
  
          // Build strategies object with safe column access
          const strategies = Object.fromEntries(
            model.map(row => [
              row.Strategy.trim(),
              {
                label: row.Strategy,
                details: row['Paragraph description'] || '',
                activities: row['Activities'] || '',
                outputs: model[0].hasOwnProperty('Output') ? arrayify(row.Output).map(output => outputs.indexOf(output)) : [],
                immediateOutputs: model[0].hasOwnProperty('Immediate Outcomes') ? arrayify(row['Immediate Outcomes']).map(output =>
                  immediateOutputs.indexOf(output),
                ) : [],
                intermediateOutputs: model[0].hasOwnProperty('Intermediate Outcomes') ? arrayify(row['Intermediate Outcomes']).map(output =>
                  intermediateOutputs.indexOf(output),
                ) : [],
                longTermOutputs: model[0].hasOwnProperty('Long-term Outcomes') ? arrayify(row['Long-term Outcomes']).map(output =>
                  longTermOutputs.indexOf(output),
                ) : [],
                partners: model[0].hasOwnProperty('Partners') ? arrayify(row.Partners).map(partner => partners.indexOf(partner)) : [],
                pbcComponents: model[0].hasOwnProperty('PBC Component') ? arrayify(row['PBC Component'] || '').map(component => pbcComponents.indexOf(component)) : [],
                research: [],
              },
            ]),
          );
  
          // Research data processing removed - no longer needed

          // Get Impact Goal - it's the same for all rows, find first non-empty one
          const impactGoal = model.length > 0 && model[0].hasOwnProperty('Impact Goal') 
            ? model.reduce((goal, row) => {
                if (goal) return goal; // If we already found a goal, keep it
                return (row['Impact Goal'] || '').trim(); // Otherwise try this row
              }, '')
            : ''; // Default to empty string if Impact Goal column doesn't exist
  
          // Build final data object
          const data = {
            headerTooltips: [
              'Place-Based Community Components',
              'Key organizations, institutions, government entities, funders, and other stakeholders collaborating on initiatives',
              'Grouped approaches that organize multiple related activities into coherent intervention areas',
              'Evidence that directly demonstrates an activity occurred as planned',
              'Preliminary results that directly follow outputs, representing initial changes in opportunities, capacity, and incentives among target populations and community systems',
              'Changes that build upon short-term outcomes, representing shifts in behaviors and community conditions',
              'Sustained, transformational changes in community conditions and quality of life that represent the strategy\'s ultimate goals'
            ],
            inputs,
            inputTooltips: inputs, // Use inputs as tooltips since we don't have separate tooltip data
            pbcComponents,
            strategies,
            partners,
            outputs,
            immediateOutputs,
            intermediateOutputs,
            longTermOutputs,
            impactGoal,
          };
  
          console.log('🎯 FINAL DATA OBJECT:');
          console.log('📊 PBC Components in data:', data.pbcComponents);
          console.log('🏗️ Sample strategy with PBC mapping:', Object.values(data.strategies)[0]);
  
          console.log('Data loaded from Google Sheets:', data);
          
          // Cache the data
          localStorage.setItem('dashboard-data', JSON.stringify(data));
          localStorage.setItem('dashboard-data-timestamp', now.toString());
          
          // Remove loading indicator
          loadingDiv.remove();
          
          return data;
  
        } else {
          // Fall back to local data.json when live sheets are disabled
          const dataRaw = await fetch('./assets/data.json');
          const data = await dataRaw.json();
          console.log('Using local data.json:', data);
          return data;
        }
         
      } catch (error) {
        console.error('Error loading data from Google Sheets:', error);
        
        // Try to fall back to local data.json
        try {
          const dataRaw = await fetch('./assets/data.json');
          const data = await dataRaw.json();
          console.log('Fallback to local data.json:', data);
          
          // Update loading indicator to show fallback
          const loadingDiv = document.getElementById(`${namespace}-loading`);
          if (loadingDiv) {
            loadingDiv.innerText = 'Using cached data (Google Sheets unavailable)';
            loadingDiv.style.color = '#f65c2c';
            setTimeout(() => loadingDiv.remove(), 3000);
          }
          
          return data;
        } catch (fallbackError) {
          console.error('Failed to load fallback data:', fallbackError);
          
          // Show error message
          const errorDiv = createElement(dashboardWrapper, 'div', 'error');
          errorDiv.style.textAlign = 'center';
          errorDiv.style.padding = '40px';
          errorDiv.style.fontSize = '18px';
          errorDiv.style.color = '#d32f2f';
          errorDiv.innerText = 'Failed to load data. Please try again later.';
          throw new Error('Failed to load data from all sources');
        }
      }
    };
  
    // Public API
    return {
      loadData
    };
  
  })(); 