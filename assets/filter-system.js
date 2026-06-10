/**
 * Unified Filter System for the Dashboard
 * Manages all filtering state and logic in one place
 */
window.FilterSystem = (function() {

    // ========================================
    // FILTER STATE (Single Source of Truth)
    // ========================================
    
    let filterState = {
      selectedPBC: null,        // Currently selected PBC component
      selectedPartner: null,    // Currently selected partner index
      selectedStrategy: null,   // Currently selected strategy index
      mode: 'overview'          // Current filtering mode
    };
  
    // Valid modes and their precedence
    const MODES = {
      overview: 'overview',           // No filters active
      pbc: 'pbc',                    // PBC component selected
      partner: 'partner',            // Partner selected  
      strategy: 'strategy',          // Strategy selected
      pbcPartner: 'pbc-partner',     // PBC + Partner
      pbcStrategy: 'pbc-strategy',   // PBC + Strategy
      partnerStrategy: 'partner-strategy' // Partner + Strategy (rare)
    };
  
    let namespace = '';
    let columnIds = {};
    let data = {};
    let strategyList = [];
  
    // ========================================
    // INITIALIZATION
    // ========================================
  
    const init = (config) => {
      namespace = config.namespace;
      columnIds = config.columnIds;
      data = config.data;
      strategyList = config.strategyList;
    };
  
    // ========================================
    // CORE FILTERING LOGIC
    // ========================================
  
    /**
     * Generic function to show/hide items in a column
     * @param {string} columnId - ID of column to filter
     * @param {Set|Array} visibleIndices - Indices of items to show
     */
    const filterColumn = (columnId, visibleIndices) => {
      const column = document.getElementById(columnId);
      if (!column) return;
  
      const children = column.getElementsByClassName(`${namespace}-data-wrapper`);
      const visibleSet = new Set(visibleIndices);
  
      [...children].forEach((child, idx) => {
        child.style.display = visibleSet.has(idx) ? 'block' : 'none';
      });
    };
  
    /**
     * Find all strategies that match current filter criteria
     * @returns {Array} Array of strategy indices
     */
    const getVisibleStrategies = () => {
      return strategyList
        .map((strategy, idx) => ({ strategy, idx }))
        .filter(({ strategy, idx }) => {
          // Check PBC filter
          if (filterState.selectedPBC) {
            const strategyPBCs = (strategy.pbcComponents || []).map(i => data.pbcComponents[i]);
            if (!strategyPBCs.includes(filterState.selectedPBC)) return false;
          }
  
          // Check Partner filter  
          if (filterState.selectedPartner !== null) {
            if (!strategy.partners || !strategy.partners.includes(filterState.selectedPartner)) return false;
          }
  
          // Check Strategy filter
          if (filterState.selectedStrategy !== null) {
            return idx === filterState.selectedStrategy;
          }
  
          return true;
        })
        .map(({ idx }) => idx);
    };
  
    /**
     * Get all items connected to visible strategies for a specific outcome type
     * @param {string} outcomeKey - Key in strategy object (e.g., 'outputs', 'partners')
     * @returns {Set} Set of connected item indices
     */
    const getConnectedItems = (outcomeKey) => {
      const connectedItems = new Set();
      const visibleStrategies = getVisibleStrategies();
  
      visibleStrategies.forEach(strategyIdx => {
        const strategy = strategyList[strategyIdx];
        if (strategy[outcomeKey]) {
          strategy[outcomeKey].forEach(itemIdx => connectedItems.add(itemIdx));
        }
      });
  
      return connectedItems;
    };
  
    /**
     * Apply all filters based on current state
     */
    const applyFilters = () => {
      const visibleStrategies = getVisibleStrategies();
  
  
  
      // Filter Strategies column
      filterColumn(columnIds.strategies, visibleStrategies);
  
      // Filter outcome columns based on connected strategies
      filterColumn(columnIds.pbcComponents, getConnectedItems('pbcComponents'));
      filterColumn(columnIds.outputs, getConnectedItems('outputs'));
      filterColumn(columnIds.immediateOutputs, getConnectedItems('immediateOutputs'));
      filterColumn(columnIds.intermediateOutputs, getConnectedItems('intermediateOutputs'));
      filterColumn(columnIds.longTermOutputs, getConnectedItems('longTermOutputs'));
  
      // Filter Partners column (special handling based on mode)
      if (filterState.selectedPartner !== null) {
        // Show only selected partner
        filterColumn(columnIds.partners, [filterState.selectedPartner]);
      } else {
        // Show all partners connected to visible strategies
        filterColumn(columnIds.partners, getConnectedItems('partners'));
      }
    };
  
    /**
     * Generate a darker shade of a given color
     * @param {string} color - Hex color code
     * @param {number} factor - Darkening factor (0.7 = 30% darker)
     * @returns {string} Darker hex color
     */
    const generateDarkerShade = (color, factor = 0.5) => {
      // Remove # if present
      const cleanColor = color.replace('#', '');
      
      // Parse RGB components
      const r = parseInt(cleanColor.substr(0, 2), 16);
      const g = parseInt(cleanColor.substr(2, 2), 16);
      const b = parseInt(cleanColor.substr(4, 2), 16);
      
      // Generate darker shade
      const newR = Math.round(Math.max(0, r * factor));
      const newG = Math.round(Math.max(0, g * factor));
      const newB = Math.round(Math.max(0, b * factor));
      
      return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    };
  
    /**
     * Update contextual "Back to..." button colors based on current PBC selection
     */
    const updateContextualButtonColors = () => {
      // Find all navigation buttons
      const allSeeAllButtons = document.querySelectorAll(`.${namespace}-see-all`);
      const contextualButtons = [];
      
      allSeeAllButtons.forEach(button => {
        const text = button.textContent || '';
        // Only target contextual "Back to..." or "Show..." buttons, not global "View All" buttons
        if (text.includes('← Show') || text.includes('← Back')) {
          contextualButtons.push(button);
        }
      });
  
      if (filterState.selectedPBC) {
        // Apply PBC theme color to contextual buttons only
        const pbcColor = window.ColorManager.getPBCColor(filterState.selectedPBC, data);
        const darkerPbcColor = generateDarkerShade(pbcColor, 0.5);
        
        contextualButtons.forEach(button => {
          button.style.setProperty('background-color', `${pbcColor}10`, 'important');
          button.style.setProperty('border-color', pbcColor, 'important');
          button.style.setProperty('color', darkerPbcColor, 'important');
        });
      } else {
        // Reset contextual buttons to default style
        contextualButtons.forEach(button => {
          button.style.removeProperty('background-color');
          button.style.removeProperty('border-color');
          button.style.removeProperty('color');
        });
      }
    };
  
    /**
     * Update strategy column text colors based on current PBC selection
     */
    const updateStrategyColumnColors = () => {
      const strategiesColumn = document.getElementById(columnIds.strategies);
      if (!strategiesColumn) return;
  
      if (filterState.selectedPBC) {
        // Apply darker PBC color to strategy text elements
        const pbcColor = window.ColorManager.getPBCColor(filterState.selectedPBC, data);
        const darkerPbcColor = generateDarkerShade(pbcColor, 0.5); // Made darker (was 0.7)
        
        // Update strategy button text
        const strategyButtons = strategiesColumn.querySelectorAll(`.${namespace}-datum.${namespace}-button`);
        strategyButtons.forEach(button => {
          button.style.setProperty('color', darkerPbcColor, 'important');
        });
        
        // Update "Learn more" button text and background
        const learnMoreButtons = strategiesColumn.querySelectorAll(`.${namespace}-filter-button`);
        learnMoreButtons.forEach(button => {
          button.style.setProperty('color', darkerPbcColor, 'important');
          button.style.setProperty('background-color', `${pbcColor}15`, 'important');
          button.style.setProperty('border-radius', '4px', 'important');
          button.style.setProperty('padding', '0px 6px', 'important');
        });
      } else {
        // Reset to default colors
        const strategyButtons = strategiesColumn.querySelectorAll(`.${namespace}-datum.${namespace}-button`);
        strategyButtons.forEach(button => {
          button.style.removeProperty('color');
        });
        
        const learnMoreButtons = strategiesColumn.querySelectorAll(`.${namespace}-filter-button`);
        learnMoreButtons.forEach(button => {
          button.style.removeProperty('color');
          button.style.removeProperty('background-color');
          button.style.removeProperty('border-radius');
          button.style.removeProperty('padding');
        });
      }
    };
  
    /**
     * Update visual state (colors, buttons, etc.) based on current filters
     */
    const updateVisualState = () => {
      // Update PBC component highlighting
      if (filterState.selectedPBC) {
        const pbcColor = window.ColorManager.getPBCColor(filterState.selectedPBC, data);
        const newGradient = window.ColorManager.generatePBCGradient(pbcColor);
        window.ColorManager.updateBrandGradient(newGradient, namespace, Object.values(columnIds), {});
  
        // Update horizontal PBC buttons and bar background
        const pbcBar = document.getElementById(`${namespace}-horizontal-pbcComponents`);
        if (pbcBar) {
          // Update the horizontal bar's background color to match selected PBC
          pbcBar.style.backgroundColor = `${pbcColor}15`; // Light background
          pbcBar.style.border = `2px solid ${pbcColor}40`; // Subtle border
          
          const buttons = pbcBar.querySelectorAll('div');
          buttons.forEach(button => {
            if (button.textContent === filterState.selectedPBC) {
              button.classList.add('selected');
              button.style.backgroundColor = pbcColor; // Full opacity for darker active state
              button.style.color = 'white'; // White text for better accessibility
            } else if (!button.classList.contains('all-pillars-button')) {
              button.classList.remove('selected');
              const buttonColor = window.ColorManager.getPBCColor(button.textContent, data);
              button.style.backgroundColor = `${buttonColor}20`;
              button.style.color = buttonColor; // Reset to original PBC color text
            }
          });
        }
      } else {
        // Reset to original colors
        const originalGradient = window.ColorManager.getOriginalBrandGradient();
        window.ColorManager.updateBrandGradient(originalGradient, namespace, Object.values(columnIds), {});
        
        // Reset horizontal bar to default colors and clear button highlights
        const pbcBar = document.getElementById(`${namespace}-horizontal-pbcComponents`);
        if (pbcBar) {
          // Reset bar to original neutral color
          pbcBar.style.backgroundColor = originalGradient[0];
          pbcBar.style.border = `2px solid ${originalGradient[0]}80`;
          
          const buttons = pbcBar.querySelectorAll('div');
          buttons.forEach(button => {
            if (button.classList.contains('all-pillars-button')) {
              // Highlight "All Pillars" when no specific PBC is selected
              button.classList.add('selected');
              const neutralColor = '#EDAC04';
              button.style.backgroundColor = neutralColor; // Full opacity for darker active state
              button.style.color = 'white'; // White text for better accessibility
            } else {
              button.classList.remove('selected');
              const buttonColor = window.ColorManager.getPBCColor(button.textContent, data);
              button.style.backgroundColor = `${buttonColor}20`;
              button.style.color = buttonColor; // Reset to original PBC color text
            }
          });
        }
      }
  
      // Update navigation button colors for contextual buttons
      updateContextualButtonColors();
  
      // Update strategy column text colors
      updateStrategyColumnColors();
  
      // Clear visual highlights
      clearHighlights();
  
      // Update filter manager state
      window.FilterManager.clearSelectedItems();
      if (filterState.selectedPBC) {
        window.FilterManager.addSelectedItem(filterState.selectedPBC);
      }
      
      // Update the PBC title display
      if (window.FilterManager.updatePBCTitle) {
        window.FilterManager.updatePBCTitle(filterState.selectedPBC, data);
      }
    };
  
    /**
     * Clear all visual highlights from the dashboard
     */
    const clearHighlights = () => {
      Object.values(columnIds).forEach(columnId => {
        const column = document.getElementById(columnId);
        if (!column) return;
  
        const children = column.getElementsByClassName(`${namespace}-data-wrapper`);
        [...children].forEach(child => {
          child.style.background = 'transparent';
          
          const textElements = child.getElementsByClassName(`${namespace}-datum`);
          [...textElements].forEach(textEl => {
            textEl.style.background = 'transparent';
            textEl.style.backgroundColor = '';
            textEl.style.boxShadow = '';
            textEl.style.opacity = '';
          });
        });
      });
  
      // Clear partner styling
      if (window.FilterManager.clearPartnerColumnColors) {
        window.FilterManager.clearPartnerColumnColors(namespace, columnIds.partners);
      }
    };
  
    // ========================================
    // PUBLIC API - FILTER ACTIONS
    // ========================================
  
    /**
     * Select a PBC component
     * @param {string} pbcComponent - Name of PBC component
     */
    const selectPBC = (pbcComponent) => {
      filterState.selectedPBC = pbcComponent;
      filterState.selectedPartner = null;
      filterState.selectedStrategy = null;
      filterState.mode = MODES.pbc;
      
      applyFilters();
      updateVisualState();
    };
  
    /**
     * Select a partner
     * @param {number} partnerIndex - Index of partner
     */
    const selectPartner = (partnerIndex) => {
      // If clicking the same partner, just return (don't clear filters)
      if (filterState.selectedPartner === partnerIndex) {
        return;
      }
  
      filterState.selectedPartner = partnerIndex;
      filterState.selectedStrategy = null;
      
      if (filterState.selectedPBC) {
        filterState.mode = MODES.pbcPartner;
      } else {
        filterState.mode = MODES.partner;
      }
      
      applyFilters();
      updateVisualState();
    };
  
    /**
     * Select a strategy
     * @param {number} strategyIndex - Index of strategy
     */
    const selectStrategy = (strategyIndex) => {
      if (filterState.selectedStrategy === strategyIndex && !filterState.selectedPartner) {
        // Clicking same strategy - clear all filters
        clearAllFilters();
        return;
      }
  
      filterState.selectedStrategy = strategyIndex;
      
      // Auto-select the strategy's primary PBC component
      const strategy = strategyList[strategyIndex];
      if (strategy.pbcComponents && strategy.pbcComponents.length > 0) {
        const primaryPBCIndex = strategy.pbcComponents[0];
        filterState.selectedPBC = data.pbcComponents[primaryPBCIndex];
      }
      
      if (filterState.selectedPartner !== null) {
        filterState.mode = MODES.partnerStrategy;
      } else if (filterState.selectedPBC) {
        filterState.mode = MODES.pbcStrategy;
      } else {
        filterState.mode = MODES.strategy;
      }
      
      applyFilters();
      updateVisualState();
    };
  
    /**
     * Show all strategies for the current PBC component
     */
    const showAllPBCStrategies = () => {
      if (!filterState.selectedPBC) return;
      
      filterState.selectedPartner = null;
      filterState.selectedStrategy = null;
      filterState.mode = MODES.pbc;
      
      applyFilters();
      updateVisualState();
    };
  
    /**
     * Show all partners for the current PBC component
     */
    const showAllPBCPartners = () => {
      if (!filterState.selectedPBC) return;
      
      filterState.selectedPartner = null;
      filterState.selectedStrategy = null;
      filterState.mode = MODES.pbc;
      
      applyFilters();
      updateVisualState();
    };
  
    /**
     * Show all strategies for the current partner
     */
    const showAllPartnerStrategies = () => {
      if (filterState.selectedPartner === null) return;
      
      filterState.selectedPBC = null;
      filterState.selectedStrategy = null;
      filterState.mode = MODES.partner;
      
      applyFilters();
      updateVisualState();
    };
  
    /**
     * Clear all filters and return to overview mode
     */
    const clearAllFilters = () => {
      filterState = {
        selectedPBC: null,
        selectedPartner: null,
        selectedStrategy: null,
        mode: MODES.overview
      };
      
      // Show all items in all columns
      Object.values(columnIds).forEach(columnId => {
        const column = document.getElementById(columnId);
        if (!column) return;
        
        const children = column.getElementsByClassName(`${namespace}-data-wrapper`);
        [...children].forEach(child => {
          child.style.display = 'block';
        });
      });
      
      updateVisualState();
    };
  
    // ========================================
    // GETTERS
    // ========================================
  
    const getFilterState = () => ({ ...filterState });
    const isStrategySelected = () => filterState.selectedStrategy !== null;
    const isPartnerSelected = () => filterState.selectedPartner !== null;
    const isPBCSelected = () => filterState.selectedPBC !== null;
  
    // ========================================
    // PUBLIC API
    // ========================================
  
    return {
      init,
      selectPBC,
      selectPartner,
      selectStrategy,
      showAllPBCStrategies,
      showAllPBCPartners,
      showAllPartnerStrategies,
      clearAllFilters,
      getFilterState,
      isStrategySelected,
      isPartnerSelected,
      isPBCSelected,
      applyFilters,
      updateVisualState
    };
  
  })(); 