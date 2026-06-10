// Filter management functionality for the dashboard
window.FilterManager = (function() {

    // Track selected items for filtering (used by PBC Components horizontal bar)
    let selectedItems = new Set();
  
    // Function to filter Partners column based on selected PBC Components
    const filterPartnersFromPBC = (namespace, partnersId, data) => {
      const pbcHorizontalBar = document.getElementById(`${namespace}-horizontal-pbcComponents`);
      if (!pbcHorizontalBar) {
        return;
      }
      
      const partnersColumn = document.getElementById(partnersId);
      if (!partnersColumn) return;
      
      // Get selected PBC components (simplified)
      const selectedPBCs = new Set([...pbcHorizontalBar.querySelectorAll('div.selected')]
        .map(btn => btn.textContent));
      
      
      const partnersChildren = partnersColumn.getElementsByClassName(`${namespace}-data-wrapper`);
      
      // Early return: if no PBC selected, show all partners
      if (selectedPBCs.size === 0) {
        [...partnersChildren].forEach(child => {
          child.style.display = 'block';
          // Use the simplified clearing approach
          const partnerItem = child.querySelector(`.${namespace}-datum`);
          if (partnerItem) {
            partnerItem.removeAttribute('style');
            ['data-pbc-colored', 'data-original-bg', 'data-original-border', 
             'data-original-border-radius', 'data-original-padding'].forEach(attr => {
              partnerItem.removeAttribute(attr);
            });
          }
        });
        return;
      }
      
      // Find visible partners (simplified)
      const visiblePartners = new Set();
      Object.values(data.strategies).forEach(strategy => {
        // Check if strategy has any selected PBC components
        const strategyPBCs = (strategy.pbcComponents || []).map(idx => data.pbcComponents[idx]);
        const hasSelectedPBC = strategyPBCs.some(pbc => selectedPBCs.has(pbc));
        
        if (hasSelectedPBC) {
          // Add all partners from this strategy
          (strategy.partners || []).forEach(partnerIdx => {
            visiblePartners.add(data.partners[partnerIdx]);
          });
        }
      });
      
      
      // Show/hide partners in one loop
      [...partnersChildren].forEach((child, idx) => {
        child.style.display = visiblePartners.has(data.partners[idx]) ? 'block' : 'none';
      });
    };
  
    // Function to clear Partner column colors
    const clearPartnerColumnColors = (namespace, partnersId) => {
      const partnersColumn = document.getElementById(partnersId);
      if (partnersColumn) {
        const partnersChildren = partnersColumn.getElementsByClassName(`${namespace}-data-wrapper`);
        [...partnersChildren].forEach(child => {
          const partnerItem = child.querySelector(`.${namespace}-datum`);
          if (partnerItem) {
            partnerItem.removeAttribute('style');
            
            // Clear data attributes in one go
            ['data-pbc-colored', 'data-original-bg', 'data-original-border', 
             'data-original-border-radius', 'data-original-padding'].forEach(attr => {
              partnerItem.removeAttribute(attr);
            });
          }
        });
      }
    };
  
    // Function to hide PBC Components column and create horizontal filter bar
    const toggleColumn = (config) => {
      console.log('\n🚀 toggleColumn called with:', {
        columnId: config.columnId,
        columnLabel: config.columnLabel,
        dataKey: config.dataKey
      });
  
      const {
        columnId, columnLabel, dataKey, colorIndex,
        namespace, strategiesId, partnersId, outputsId, immediateOutputsId, intermediateOutputsId, longTermOutputsId,
        dashboard, dashboardWrapper, data, strategyValues,
        addElement, getPBCColor, generatePBCGradient, updateBrandGradient, updateButtonVisibility
      } = config;
  
      // Find the column header by looking for the header with the specified label
      const allHeaders = document.querySelectorAll(`.${namespace}-header`);
      const columnHeader = Array.from(allHeaders).find(header => 
        header.querySelector('h2') && header.querySelector('h2').textContent.includes(columnLabel)
      );
      const column = document.getElementById(columnId);
      
      // Check if horizontal bar already exists
      let horizontalBar = document.getElementById(`${namespace}-horizontal-${dataKey}`);
      
      // Function to filter strategies based on selected items
      const filterStrategiesByItems = () => {
        const strategiesColumn = document.getElementById(strategiesId);
        if (!strategiesColumn) return;
        
        const strategiesChildren = strategiesColumn.getElementsByClassName(`${namespace}-data-wrapper`);
        
        if (selectedItems.size === 0) {
          // Show all strategies
          [...strategiesChildren].forEach(child => {
            child.style.display = 'block';
          });
          
          // Show all items in other columns
          const allColumns = [partnersId, outputsId, immediateOutputsId, intermediateOutputsId, longTermOutputsId];
          allColumns.forEach(columnId => {
            const column = document.getElementById(columnId);
            if (column) {
              const columnChildren = column.getElementsByClassName(`${namespace}-data-wrapper`);
              [...columnChildren].forEach(child => {
                child.style.display = 'block';
              });
            }
          });
          
          // Clear Partner column colors when no PBC Components are selected
          if (dataKey === 'pbcComponents') {
            clearPartnerColumnColors(namespace, partnersId);
            // Reset brand gradient to original colors when no PBC components are selected
            updateBrandGradient(window.ColorManager.getOriginalBrandGradient());
          }
          
          return;
        }
        
        // Get visible strategies
        const visibleStrategies = [];
        
        [...strategiesChildren].forEach((child, idx) => {
          const strategy = strategyValues[idx];
          const strategyItems = strategy[dataKey] ? strategy[dataKey].map(itemIdx => data[dataKey][itemIdx]) : [];
          const hasSelectedItem = strategyItems.some(item => selectedItems.has(item));
          
          
          if (hasSelectedItem) {
            visibleStrategies.push(strategy);
            child.style.display = 'block';
          } else {
            child.style.display = 'none';
          }
        });
              
        // Filter other columns based on visible strategies
        const filterColumnByStrategies = (columnId, dataKey) => {
          const column = document.getElementById(columnId);
          if (!column) return;
          
          const columnChildren = column.getElementsByClassName(`${namespace}-data-wrapper`);
          const columnData = data[dataKey];
          
          [...columnChildren].forEach((child, idx) => {
            const item = columnData[idx];
            
            // Check if this item is connected to any visible strategy
            const isConnected = visibleStrategies.some(strategy => {
              const strategyItems = strategy[dataKey];
              return strategyItems && strategyItems.includes(idx);
            });
            
            child.style.display = isConnected ? 'block' : 'none';
          });
        };
        
        // Filter each column
        filterColumnByStrategies(outputsId, 'outputs');
        filterColumnByStrategies(immediateOutputsId, 'immediateOutputs');
        filterColumnByStrategies(intermediateOutputsId, 'intermediateOutputs');
        filterColumnByStrategies(longTermOutputsId, 'longTermOutputs');
        
        // Always filter Partners column based on visible strategies
        if (dataKey === 'pbcComponents') {
          // When filtering by PBC Components, filter Partners based on the strategies that are visible
          const partnersColumn = document.getElementById(partnersId);
          if (partnersColumn) {
            const partnersChildren = partnersColumn.getElementsByClassName(`${namespace}-data-wrapper`);
            
            [...partnersChildren].forEach((child, idx) => {
              const partner = data.partners[idx];
              
              // Check if this partner is connected to any visible strategy
              const isConnectedToPBCComponent = visibleStrategies.some(strategy => {
                return strategy.partners && strategy.partners.includes(idx);
              });
              
              if (isConnectedToPBCComponent) {
                child.style.display = 'block';
              } else {
                child.style.display = 'none';
              }
              
            });
          }
        } else {
          // For other filtering types, filter Partners normally
          filterColumnByStrategies(partnersId, 'partners');
        }
      };
      
      // Hide column and create horizontal filter bar
      if (columnHeader) columnHeader.style.display = 'none';
      if (column) column.style.display = 'none';
      
      // Create horizontal bar if it doesn't exist
      if (!horizontalBar) {
          console.log('🔍 Creating new container for:', dataKey);
          console.log('Current selected items:', [...selectedItems]);
          
          // Create main container for title and horizontal bar
          const pbcContainer = addElement(dashboard, 'div', `pbc-container-${dataKey}`);
          console.log('📦 Created container:', `pbc-container-${dataKey}`);
          
          pbcContainer.style.display = 'flex';
          pbcContainer.style.alignItems = 'center';
          pbcContainer.style.gap = '20px';
          pbcContainer.style.marginBottom = '20px';
          pbcContainer.style.padding = '15px';
          pbcContainer.style.flexWrap = 'wrap'; // Allow wrapping on smaller screens
          
          // Get gradient colors (needed for both title and horizontal bar)
          const currentGradient = window.ColorManager.getCurrentBrandGradient();
          
            // Only create title for PBC Components
            if (dataKey === 'pbcComponents') {
              console.log('🎯 Creating title section for PBC Components');
              
              // Create a container for logo and title
              const titleSection = addElement(pbcContainer, 'div', `title-section-${dataKey}`);
              titleSection.style.display = 'flex';
              titleSection.style.flexDirection = 'column';
              titleSection.style.flex = '1';
              titleSection.style.minWidth = '250px';
              titleSection.style.marginBottom = '10px';
              titleSection.style.alignItems = 'flex-start'; // Ensure children are left-aligned
              
              // Add logo using configured assets path
              const logoImg = document.createElement('img');
              logoImg.src = `${window.DASHBOARD_CONFIG.ASSETS_PATH}/reach-riverside-logo.png`;
              logoImg.alt = 'Logo';
              logoImg.style.height = '50px';
              logoImg.style.marginBottom = '15px';
              logoImg.style.objectFit = 'contain';
              logoImg.style.alignSelf = 'flex-start'; // Ensure logo itself is left-aligned
              titleSection.appendChild(logoImg);
              
              // Create title element
              const currentSelectionTitle = document.createElement('div');
              currentSelectionTitle.id = `${namespace}-current-selection-${dataKey}`;
              currentSelectionTitle.style.fontSize = '2.5em';
              currentSelectionTitle.style.fontWeight = 'bold';
              currentSelectionTitle.style.color = currentGradient[9];
              currentSelectionTitle.textContent = 'All Components';
              titleSection.appendChild(currentSelectionTitle);
              
              // Store reference to title for updates
              window.currentPBCTitle = currentSelectionTitle;
              console.log('🔗 Stored title reference for PBC Components');
          } else {
            console.log('⏭️ Skipping title creation for:', dataKey);
          }
          
          // Create right side horizontal bar
          horizontalBar = addElement(pbcContainer, 'div', `horizontal-${dataKey}`);
          horizontalBar.style.display = 'flex';
          horizontalBar.style.flexWrap = 'wrap';
          horizontalBar.style.gap = '10px';
          horizontalBar.style.padding = '15px';
          horizontalBar.style.backgroundColor = currentGradient[0];
          horizontalBar.style.border = `2px solid ${currentGradient[colorIndex]}80`;
          horizontalBar.style.borderRadius = '8px';
          horizontalBar.style.flex = '2';
          horizontalBar.style.minWidth = '350px';
          
          // Add title
          const titleDiv = addElement(horizontalBar, 'div');
          titleDiv.style.fontWeight = 'bold';
          titleDiv.style.marginBottom = '10px';
          titleDiv.style.width = '100%';
          titleDiv.style.color = currentGradient[9];
          titleDiv.textContent = `${columnLabel} (click to filter):`;
          
          // Add items as clickable toggle buttons
          data[dataKey].forEach(item => {
            const itemDiv = addElement(horizontalBar, 'div');
            
            // Add base filter button class
            itemDiv.classList.add('momentum-dashboard-filter-button');
            
            // Add specific classes based on item type
            if (dataKey === 'pbcComponents') {
              // Add PBC Component specific class based on index for dynamic coloring
              const pbcIndex = data[dataKey].indexOf(item);
              itemDiv.classList.add(`pbc-component-${pbcIndex}`);
              
              // Set the background color directly for the button
              const pbcColor = getPBCColor(item);
              itemDiv.style.setProperty('--pbc-color', pbcColor);
              itemDiv.style.backgroundColor = `${pbcColor}40`;
              itemDiv.style.borderColor = `${pbcColor}90`;
              itemDiv.style.color = pbcColor;
              
              // Add hover and selected state handling
              itemDiv.addEventListener('mouseenter', () => {
                if (!itemDiv.classList.contains('selected')) {
                  // Check if we're in "All Pillars" mode or specific PBC mode
                  if (window.FilterSystem && window.FilterSystem.isPBCSelected && window.FilterSystem.isPBCSelected()) {
                    // Specific PBC is selected - use this button's own PBC component color
                  itemDiv.style.backgroundColor = `${pbcColor}40`;
                  } else {
                    // "All Pillars" mode - use gray color
                    const grayColor = '#FFC120';
                    itemDiv.style.backgroundColor = `${grayColor}40`;
                  }
                }
              });
              
              itemDiv.addEventListener('mouseleave', () => {
                if (!itemDiv.classList.contains('selected')) {
                  itemDiv.style.backgroundColor = `${pbcColor}20`;
                }
              });
            }
            
            itemDiv.textContent = item;
            
            // Add click functionality
            itemDiv.addEventListener('click', () => {
              const isPBCComponent = dataKey === 'pbcComponents';
              
              if (isPBCComponent) {
                // Exclusive selection for PBC Components
                if (selectedItems.has(item)) {
                  // Deselect the current item
                  selectedItems.delete(item);
                  itemDiv.classList.remove('selected');
                  
                  // Reset to unselected styling for PBC components
                  const pbcColor = getPBCColor(item);
                  const darkerPbcColor = window.ColorManager.generateDarkerShade(pbcColor, 0.7); // 70% darker for better contrast
                  itemDiv.style.backgroundColor = `${pbcColor}20`;
                  itemDiv.style.color = darkerPbcColor; // Use darker shade for better contrast
                  
                  // Reset to original brand gradient when PBC component is deselected
                  updateBrandGradient(window.ColorManager.getOriginalBrandGradient());
                  
                  // Update title to show no selection
                  if (window.currentPBCTitle) {
                    window.currentPBCTitle.textContent = 'Select a PBC Component';
                    window.currentPBCTitle.style.color = window.ColorManager.getCurrentBrandGradient()[9];
                  }
                  
                  // ✅ SYNC WITH FILTER SYSTEM
                  if (window.FilterSystem && window.FilterSystem.clearAllFilters) {
                    window.FilterSystem.clearAllFilters();
                  }
                } else {
                  // First, deselect all other PBC Components
                  const allPBCButtons = horizontalBar.querySelectorAll('div:not(.all-pillars-button)');
                  allPBCButtons.forEach(button => {
                    if (button.textContent && button.classList.contains('selected')) {
                      selectedItems.delete(button.textContent);
                      button.classList.remove('selected');
                      
                      // Reset styling for deselected PBC components
                      const buttonPBCColor = getPBCColor(button.textContent);
                      button.style.backgroundColor = `${buttonPBCColor}20`;
                      button.style.color = buttonPBCColor; // Reset to original PBC color text
                    }
                  });
                  
                  // Then select the clicked item
                  selectedItems.add(item);
                  itemDiv.classList.add('selected');
                  
                  // Reset All Pillars button to normal state
                  const allPillarsButton = horizontalBar.querySelector('.all-pillars-button');
                  if (allPillarsButton) {
                    const neutralColor = '#FFC120';
                    allPillarsButton.style.backgroundColor = `${neutralColor}40`;
                    allPillarsButton.style.borderColor = `${neutralColor}80`;
                    allPillarsButton.style.color = '#846310';
                  }
                  
                  // Apply selected styling for PBC components
                  const pbcColor = getPBCColor(item);
                  itemDiv.style.backgroundColor = pbcColor; // Full opacity for darker active state
                  itemDiv.style.color = 'white'; // White text for better accessibility
                  
                  // Update brand gradient based on selected PBC component
                  const newGradient = generatePBCGradient(pbcColor);
                  updateBrandGradient(newGradient);
                  
                  // Update title to show selected PBC component
                  if (window.currentPBCTitle) {
                    window.currentPBCTitle.textContent = item;
                    window.currentPBCTitle.style.color = pbcColor;
                  }
                  
                  // ✅ SYNC WITH FILTER SYSTEM
                  if (window.FilterSystem && window.FilterSystem.selectPBC) {
                    window.FilterSystem.selectPBC(item);
                  }
                }
                
                // Update button visibility when PBC component is selected
                updateButtonVisibility();
              } else {
                // Non-exclusive selection for other types (if any)
                if (selectedItems.has(item)) {
                  // Deselect item
                  selectedItems.delete(item);
                  itemDiv.classList.remove('selected');
                } else {
                  // Select item
                  selectedItems.add(item);
                  itemDiv.classList.add('selected');
                }
              }
              
              filterStrategiesByItems();
            });
            
          });
          
          // Add simplified "All Pillars" button at the end
          const allPillarsDiv = addElement(horizontalBar, 'div');
          allPillarsDiv.classList.add('momentum-dashboard-filter-button');
          allPillarsDiv.classList.add('all-pillars-button');
          allPillarsDiv.textContent = 'All Components';
          
          // Simple styling - inherit most from the base filter button class
          const neutralColor = '#FFC120';
          allPillarsDiv.style.backgroundColor = `${neutralColor}40`;  // 50% opacity
          allPillarsDiv.style.borderColor = `${neutralColor}80`;
          allPillarsDiv.style.color = '#846310';
          
          // Click handler for All Pillars
          allPillarsDiv.addEventListener('click', () => {
            // Highlight All Pillars button
            allPillarsDiv.style.backgroundColor = '#FFC120';  // Full opacity
            allPillarsDiv.style.color = 'white';

            // Reset other PBC buttons
            const allPBCButtons = horizontalBar.querySelectorAll('div:not(.all-pillars-button)');
            allPBCButtons.forEach(button => {
              if (button.textContent) {
                const buttonPBCColor = getPBCColor(button.textContent);
                button.style.backgroundColor = `${buttonPBCColor}20`;
                button.style.color = buttonPBCColor;
                button.classList.remove('selected');
              }
            });

            if (window.FilterSystem && window.FilterSystem.clearAllFilters) {
              window.FilterSystem.clearAllFilters();
            }
          });
          
          // Insert the PBC container before the dashboardWrapper
          dashboard.insertBefore(pbcContainer, dashboardWrapper);
        } else {
          horizontalBar.style.display = 'flex';
        }
    };
  
  // Function to update the PBC title display
    const updatePBCTitle = (pbcComponent = null, data = null) => {
      if (!window.currentPBCTitle) return;
      
      if (pbcComponent && data) {
        window.currentPBCTitle.textContent = pbcComponent;
        const pbcColor = window.ColorManager.getPBCColor(pbcComponent, data);
        window.currentPBCTitle.style.color = pbcColor;
      } else {
        window.currentPBCTitle.textContent = 'All Components';
        const neutralColor = '#FFC120';
        window.currentPBCTitle.style.color = neutralColor;
        }
    };
    // Function to clear all filters and show all columns
    const unfilterColumns = (config) => {
      const {
        namespace, pbcComponentsId, partnersId, strategiesId, outputsId, immediateOutputsId, intermediateOutputsId, longTermOutputsId,
        textClass, getPBCColor, updateBrandGradient, updateButtonVisibility
      } = config;
  
      // Clear selected items
      selectedItems.clear();
      
      // Clear PBC Component selections in the top filter
      const pbcHorizontalBar = document.getElementById(`${namespace}-horizontal-pbcComponents`);
      if (pbcHorizontalBar && pbcHorizontalBar.style.display !== 'none') {
        const selectedPBCButtons = pbcHorizontalBar.querySelectorAll('div.selected');
        selectedPBCButtons.forEach(button => {
          button.classList.remove('selected');
          
          // Reset the button's visual styling to unselected state
          const pbcColor = getPBCColor(button.textContent);
          button.style.backgroundColor = `${pbcColor}20`;
        });
        
        // Trigger the filter update which will detect no selected PBC components
        // and reset everything properly
        filterPartnersFromPBC(namespace, partnersId, config.data);
        
        // Also ensure strategies column shows all items when PBC filters are cleared
        const strategiesColumn = document.getElementById(strategiesId);
        if (strategiesColumn) {
          const strategiesChildren = strategiesColumn.getElementsByClassName(`${namespace}-data-wrapper`);
          [...strategiesChildren].forEach(child => {
            child.style.display = 'block';
          });
        }
      }
      
      [pbcComponentsId, partnersId, strategiesId, outputsId, immediateOutputsId, intermediateOutputsId, longTermOutputsId].forEach(columnId => {
        const column = document.getElementById(columnId);
        const columnChildren = column.getElementsByClassName(`${namespace}-data-wrapper`);
        [...columnChildren].forEach(child => {
          child.style.display = 'block';
          // Clear any background highlighting
          child.style.background = 'transparent';
          
          // Also clear highlights from the text elements inside
          const textElements = child.getElementsByClassName(textClass);
          [...textElements].forEach(textEl => {
            textEl.style.background = 'transparent';
            textEl.style.backgroundColor = '';
            textEl.style.boxShadow = '';
            textEl.style.opacity = '';
          });
        });
      });
      
      // Clear Partner column colors
      clearPartnerColumnColors(namespace, partnersId);
      
      // Reset brand gradient to original colors
      updateBrandGradient(window.ColorManager.getOriginalBrandGradient());
      
      updateButtonVisibility();
    };
  
    // Function to update button visibility based on current filter state
    const updateButtonVisibility = (config) => {
      const {
        showAllPartnerStrategiesButton, 
        showAllPBCStrategiesButton, showAllPBCPartnersButton,
        clickedStrategy, clickedPartner, namespace, partnersId, data
      } = config;
  
      // Hide all contextual buttons first
      showAllPartnerStrategiesButton.style.display = 'none';
      showAllPBCStrategiesButton.style.display = 'none';
      showAllPBCPartnersButton.style.display = 'none';
      
      const isPBCSelected = selectedItems.size > 0;
      
      if (isPBCSelected) {
        // Get the selected PBC component name
        const selectedPBCName = Array.from(selectedItems)[0];
        
        // Update button text with the actual PBC component name
        showAllPBCStrategiesButton.textContent = `← Back to ${selectedPBCName.toUpperCase()} strategies`;
        showAllPBCPartnersButton.textContent = `← Back to ${selectedPBCName.toUpperCase()} partners`;
        
        // Show both PBC back buttons when you've drilled down to any specific item
        if (clickedStrategy || clickedPartner) {
          showAllPBCStrategiesButton.style.display = 'block';
          showAllPBCPartnersButton.style.display = 'block';
        }
        
        // Additionally show partner-strategy button if both are selected
        if (clickedStrategy && clickedPartner) {
          showAllPartnerStrategiesButton.style.display = 'block';
        }
      } else {
        // No PBC component selected - we're in "All Pillars" mode
        // Update button text for the general case
        showAllPBCStrategiesButton.textContent = `← Back to All Strategies`;
        showAllPBCPartnersButton.textContent = `← Back to All Partners`;
        
        // Show contextual buttons when specific items are clicked in "All Pillars" mode
        if (clickedStrategy || clickedPartner) {
          showAllPBCStrategiesButton.style.display = 'block';
          showAllPBCPartnersButton.style.display = 'block';
        }
        
        // Additionally show partner-strategy button if both are selected
        if (clickedStrategy && clickedPartner) {
          showAllPartnerStrategiesButton.style.display = 'block';
        }
      }
    };
  
    // Getters and setters for selectedItems
    const getSelectedItems = () => {
      return new Set(selectedItems);
    };
  
    const setSelectedItems = (items) => {
      selectedItems = new Set(items);
    };
  
    const addSelectedItem = (item) => {
      selectedItems.add(item);
    };
  
    const removeSelectedItem = (item) => {
      selectedItems.delete(item);
    };
  
    const clearSelectedItems = () => {
      selectedItems.clear();
    };
  
    const hasSelectedItems = () => {
      return selectedItems.size > 0;
    };
  
    const getSelectedItemsSize = () => {
      return selectedItems.size;
    };
  
    // Public API
    return {
      filterPartnersFromPBC,
      clearPartnerColumnColors,
      toggleColumn,
      unfilterColumns,
      updateButtonVisibility,
      updatePBCTitle,
      getSelectedItems,
      setSelectedItems,
      addSelectedItem,
      removeSelectedItem,
      clearSelectedItems,
      hasSelectedItems,
      getSelectedItemsSize
    };
  })(); 