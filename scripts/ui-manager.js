// scripts/ui-manager.js
import { MODULE_ID, SETTINGS_KEYS } from './settings.js';
import { detectFabulaUltimaSets, SET_NAMES, getSetColor } from './set-detector.js';
import { updateSetInfoBar, showSetTooltip, hideSetTooltip, clearHighlights } from './ui-enhancements.js';
import { getPlayerPiles, getCurrentPlayerPiles, getTablePile } from './pile-manager.js';
import { DialogManager } from './dialog-manager.js';
import { EventHandlers } from './event-handlers.js';

export class UIManager {
  
  // Render the table area
  static renderTable() {
    const tableArea = document.getElementById('fu-table-area');
    const tablePile = getTablePile();
    
    if (!tablePile) return;
    
    const cards = tablePile.cards;

    // Hide the entire table area if empty
    if (cards.size === 0) {
      tableArea.style.display = 'none';
      return;
    }
    
    // Otherwise make sure it's visible
    tableArea.style.display = 'flex';

    // Now render the cards
    const container = document.getElementById('fu-table-cards');
    container.innerHTML = '';
    
    for (const c of cards) {
      const d = document.createElement('div');
      d.className = 'fu-card';
      d.style.backgroundImage = `url(${c.faces[c.face ?? 0]?.img})`;
      d.dataset.cardId = c.id;
      
      // Apply player color
      this.applyPlayerColor(d, c);
      
      // Check if this is a joker with phantom values
      const isJoker = c.name.toLowerCase().includes('joker') || c.getFlag(MODULE_ID, 'isJoker');
      
      if (isJoker && c.getFlag(MODULE_ID, 'phantomSuit') && c.getFlag(MODULE_ID, 'phantomValue')) {
        const phantomSuit = c.getFlag(MODULE_ID, 'phantomSuit');
        const phantomValue = c.getFlag(MODULE_ID, 'phantomValue');
        
        // Add data attributes for styling - READ ONLY
        d.classList.add('fu-joker-card-table'); // Different class to style differently
        d.dataset.phantomSuit = phantomSuit;
        d.dataset.phantomValue = phantomValue;
        
        // Add tooltip showing the phantom card it represents
        const suitSymbols = { 'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠' };
        const suitSymbol = suitSymbols[phantomSuit] || '';
        d.dataset.tooltip = `Joker as ${phantomValue} of ${window.capitalize(phantomSuit)} ${suitSymbol}`;
      } else {
        // Regular tooltip
        const tooltip = this.createCardTooltip(c);
        if (tooltip) {
          d.dataset.tooltip = tooltip;
        }
      }
      
      // Add to the container
      container.appendChild(d);
    }
    
    // Update set info bar for table
    if (cards.size > 0) {
    // Use the imported EventHandlers or a safe reference
    const handleTableSetClick = window.FuAceCards?.handleTableSetClick || 
                                EventHandlers.handleTableSetClick.bind(EventHandlers);
    updateSetInfoBar(Array.from(cards), 'table', handleTableSetClick);
    }
  }
  
  // Render the hand area
  static renderHand() {
    // Bail out if the hand area isn't in the DOM
    const handCards = document.getElementById('fu-hand-cards');
    if (!handCards) return;

    handCards.innerHTML = '';
    
    // Check if player has piles assigned
    const piles = getCurrentPlayerPiles();
    if (!piles?.hand) return;
    
    const hand = piles.hand;
    if (!hand) return;

    for (const c of hand.cards) {
      const d = document.createElement('div');
      d.className = 'fu-card';
      d.style.backgroundImage = `url(${c.faces[c.face ?? 0]?.img})`;
      d.dataset.cardId = c.id;

      // Add discard button (X) to the card
      const discardBtn = document.createElement('div');
      discardBtn.className = 'fu-card-discard';
      discardBtn.innerHTML = '<i class="fas fa-times"></i>';
      discardBtn.title = 'Discard this card';
      
      // Add click handler for the discard button
      discardBtn.addEventListener('click', async (event) => {
        event.stopPropagation(); // Prevent the card click from triggering
        
        // Validate the card is still in hand
        if (!hand.cards.has(c.id)) {
          ui.notifications.warn('Card no longer in hand');
          this.renderHand();
          return;
        }
        
        // Clean up tooltips
        this.cleanupAllTooltips();
        
        // Directly discard this card - use card controller if available through global API
        if (window.FuAceCards?.CardController) {
          await window.FuAceCards.CardController.discardCard(c.id);
        } else if (window.FuAceCards?.discardCard) {
          await window.FuAceCards.discardCard(c.id);
        } else {
          console.error(`${MODULE_ID} | Cannot find discardCard method`);
        }
      });
      
      // Append the discard button to the card
      d.appendChild(discardBtn);

      // Check if this is a joker card
      const isJoker = c.name.toLowerCase().includes('joker') || c.getFlag(MODULE_ID, 'isJoker');
      
      if (isJoker) {
        // Add joker class and attributes
        d.classList.add('fu-joker-card');
        
        // Get any previously set phantom values
        const phantomSuit = c.getFlag(MODULE_ID, 'phantomSuit');
        const phantomValue = c.getFlag(MODULE_ID, 'phantomValue');
        
        if (phantomSuit && phantomValue) {
          // If joker already has phantom values, show them
          d.dataset.phantomSuit = phantomSuit;
          d.dataset.phantomValue = phantomValue;
          
          // Add tooltip showing the phantom card it represents
          const suitSymbols = { 'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠' };
          const suitSymbol = suitSymbols[phantomSuit] || '';
          d.dataset.tooltip = `Joker as ${phantomValue} of ${window.capitalize(phantomSuit)} ${suitSymbol}`;
        } else {
          // If no phantom values yet, tooltip indicates it needs assignment
          d.dataset.tooltip = "Right-click to assign suit and value";
        }
          
        // Add right-click handler for joker cards - ONLY IN HAND
        d.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          DialogManager.openJokerDialog(c);
        });
      } else {
        // Regular card tooltip
        d.dataset.tooltip = c.name;
      }

      // Play a single card from hand to table
      d.addEventListener('click', async () => {
        // Validate the card is still in hand before attempting to pass
        if (!hand.cards.has(c.id)) {
          ui.notifications.warn('Card no longer in hand');
          this.renderHand();
          return;
        }

        // Check if this is a joker without assigned values
        const isJoker = c.name.toLowerCase().includes('joker') || c.getFlag(MODULE_ID, 'isJoker');
        if (isJoker && (!c.getFlag(MODULE_ID, 'phantomSuit') || !c.getFlag(MODULE_ID, 'phantomValue'))) {
          ui.notifications.warn("Please assign a suit and value to the joker before playing it (right-click)");
          return; // Prevent playing unassigned joker
        }
        
        // Clean up tooltips before moving cards
        this.cleanupAllTooltips();
        
        // Use CardController to handle the actual card play - add safety check
        if (window.FuAceCards?.CardController) {
          await window.FuAceCards.CardController.playCardToTable(c);
        } else {
          // Direct fallback implementation in case CardController isn't available
          console.warn(`${MODULE_ID} | CardController not found, using fallback implementation`);
          try {
            const tablePile = getTablePile();
            if (tablePile) {
              await hand.pass(tablePile, [c.id], { chatNotification: false });
              this.renderHand();
              this.renderTable();
            }
          } catch (error) {
            console.error("Error playing card:", error);
            this.renderHand();
          }
        }
      });
      
      // Apply player color
      this.applyPlayerColor(d, c);
      
      handCards.appendChild(d);
    }
    
    // Update set info bar for hand with click handler
    if (hand.cards.size > 0) {
        // Check if window.FuAceCards exists and has handleHandSetClick method
        const handleSetClick = window.FuAceCards?.handleHandSetClick || 
                              ((indicator) => console.warn(`${MODULE_ID} | handleHandSetClick not found`));
        
        updateSetInfoBar(Array.from(hand.cards), 'hand', handleSetClick);
    }
}
  
  // Show the hand area
  static showHandArea() {
    const handArea = document.getElementById('fu-hand-area');
    if (handArea) {
      handArea.classList.add('open');
      clearTimeout(handArea._drawerTimeout);
      handArea._drawerTimeout = setTimeout(() => {
        handArea.classList.remove('open');
      }, 10000);
    }
  }
  
  // Apply player color to card element
  static applyPlayerColor(cardElement, card) {
    if (!game.settings.get(MODULE_ID, SETTINGS_KEYS.SHOW_PLAYER_COLORS)) return;
    
    const ownerId = card.getFlag(MODULE_ID, 'ownerId');
    if (ownerId) {
      const color = this.getPlayerColor(ownerId);
      cardElement.dataset.ownerId = ownerId;
      cardElement.style.setProperty('--player-color', color);
      cardElement.classList.add('fu-card-owned');
    }
  }

  // Apply player color to card element
  static applyPlayerColor(cardElement, card) {
  // Add safety check for settings
  if (!game.settings || !game.settings.get) return;
  
  try {
      if (!game.settings.get(MODULE_ID, SETTINGS_KEYS.SHOW_PLAYER_COLORS)) return;
      
      const ownerId = card.getFlag(MODULE_ID, 'ownerId');
      if (ownerId) {
      const color = this.getPlayerColor(ownerId);
      cardElement.dataset.ownerId = ownerId;
      cardElement.style.setProperty('--player-color', color);
      cardElement.classList.add('fu-card-owned');
      }
  } catch (error) {
      console.warn(`${MODULE_ID} | Could not apply player color:`, error);
  }
  }
  
  // Create tooltip for card
  static createCardTooltip(card) {
    if (!game.settings.get(MODULE_ID, SETTINGS_KEYS.SHOW_TOOLTIPS)) return '';
    
    const ownerId = card.getFlag(MODULE_ID, 'ownerId');
    const owner = ownerId ? game.users.get(ownerId) : null;
    
    let tooltip = card.name;
    if (owner) {
      tooltip += ` (${owner.name})`;
    }
    
    return tooltip;
  }
  
  // Clean up all tooltips
  static cleanupAllTooltips() {
    // Remove any active tooltips
    if (this.activeTooltips) {
      this.activeTooltips.forEach(tooltip => {
        if (tooltip && tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      });
      this.activeTooltips.clear();
    } else {
      this.activeTooltips = new Set();
    }
    
    // Also remove any tooltips with class fu-set-tooltip
    document.querySelectorAll('.fu-set-tooltip').forEach(tooltip => tooltip.remove());
    
    // And remove the tooltip with ID fu-set-tooltip if it exists
    const tooltipElement = document.getElementById('fu-set-tooltip');
    if (tooltipElement) tooltipElement.remove();
    
    // Clear card highlights
    clearHighlights();
  }
  
  // Initialize the UI manager
  static initialize() {
    this.playerColorCache = new Map();
    this.activeTooltips = new Set();
  }
}

// Initialize the class when imported
UIManager.initialize();