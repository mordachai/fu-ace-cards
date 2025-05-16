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

  // Check for active discard abilities
  const isMulliganActive = game.user.getFlag(MODULE_ID, 'mulliganActive') === true;
  const isHighOrLowActive = game.user.getFlag(MODULE_ID, 'highOrLowActive') === true;
  const allowGeneralDiscard = game.settings.get(MODULE_ID, 'allowCardDiscard') || false;
  
  // Get discard limits for abilities like Mulligan
  const discardLimit = game.user.getFlag(MODULE_ID, 'discardLimit') || 0;
  const discardCount = game.user.getFlag(MODULE_ID, 'discardCount') || 0;
  const canDiscard = allowGeneralDiscard || isMulliganActive || isHighOrLowActive;
  const remainingDiscards = discardLimit - discardCount;

  // Remove any existing Mulligan indicator to avoid duplicates
  const existingIndicator = document.querySelector('.fu-mulligan-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }

  // Add a small indicator for Mulligan if active
  if (isMulliganActive && handCards.parentElement && remainingDiscards > 0) {
    const mulliganIndicator = document.createElement('div');
    mulliganIndicator.className = 'fu-mulligan-indicator';
    mulliganIndicator.innerHTML = `<span>Mulligan: ${remainingDiscards} discard${remainingDiscards !== 1 ? 's' : ''} remaining</span>`;
    handCards.parentElement.prepend(mulliganIndicator);
  }

  for (const c of hand.cards) {
    const d = document.createElement('div');
    d.className = 'fu-card';
    d.style.backgroundImage = `url(${c.faces[c.face ?? 0]?.img})`;
    d.dataset.cardId = c.id;

    // Only add discard button if discarding is allowed and we have discards remaining
    if (canDiscard && (!isMulliganActive || remainingDiscards > 0)) {
      const discardBtn = document.createElement('div');
      discardBtn.className = 'fu-card-discard';
      discardBtn.innerHTML = '<i class="fas fa-times"></i>';
      discardBtn.title = isMulliganActive ? `Discard card (${remainingDiscards} remaining)` : 'Discard this card';
      
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
        
        // Directly discard this card
        if (window.FuAceCards?.CardController) {
          await window.FuAceCards.CardController.discardCard(c.id);
          
          // Handle Mulligan tracking if active
          if (isMulliganActive) {
            const newCount = discardCount + 1;
            await game.user.setFlag(MODULE_ID, 'discardCount', newCount);
            
            // Draw a card for Mulligan
            await window.FuAceCards.CardController.drawCard();
            
            // Check if we've hit the limit
            if (newCount >= discardLimit) {
              // End Mulligan mode
              await this.endMulliganComplete();
            } else {
              // Re-render to update remaining discards display
              this.renderHand();
            }
          }
        } else if (window.FuAceCards?.discardCard) {
          await window.FuAceCards.discardCard(c.id);
        } else {
          console.error(`${MODULE_ID} | Cannot find discardCard method`);
        }
      });
      
      // Append the discard button to the card
      d.appendChild(discardBtn);
    }

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

  static getPlayerColor(userId) {
  // Add caching to avoid repeatedly getting the same color
  if (!this.playerColorCache) {
    this.playerColorCache = new Map();
  }
  
  if (this.playerColorCache.has(userId)) {
    return this.playerColorCache.get(userId);
  }
  
  const user = game.users.get(userId);
  const color = user?.color || '#FFFFFF';
  this.playerColorCache.set(userId, color);
  return color;
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

  static async startMulligan() {
    // Check if already in Mulligan mode
    if (game.user.getFlag(MODULE_ID, 'mulliganActive')) {
      ui.notifications.info("Mulligan is already active");
      return false;
    }
    
    // Get player character to check skill level
    const actor = game.user.character;
    if (!actor) {
      ui.notifications.warn("No character assigned to your user");
      return false;
    }
    
    // Check if player has the Mulligan skill
    const mulliganSkill = actor.items.find(i => 
      i.name === "Mulligan" || 
      (i.name === "Magic Cards" && i.system?.level >= 5)
    );
    
    // Determine skill level - default to 0 if not found
    let skillLevel = 0;
    
    if (mulliganSkill) {
      if (mulliganSkill.name === "Mulligan") {
        // Extract the level as a number
        skillLevel = Number(mulliganSkill.system?.level) || 1;
      } else if (mulliganSkill.name === "Magic Cards" && Number(mulliganSkill.system?.level) >= 5) {
        // If Magic Cards level 5+, allow Mulligan with skill level of 1
        skillLevel = 1;
      }
    } else {
      ui.notifications.warn("You don't have the Mulligan skill");
      return false;
    }
    
    // Ensure skillLevel is a valid number
    if (isNaN(skillLevel) || skillLevel <= 0) {
      skillLevel = 1; // Fallback to 1 if we couldn't get a valid number
    }
    
    // Set up the Mulligan state
    await game.user.setFlag(MODULE_ID, 'mulliganActive', true);
    await game.user.setFlag(MODULE_ID, 'discardLimit', skillLevel);
    await game.user.setFlag(MODULE_ID, 'discardCount', 0);
    
    // Show notification
    ui.notifications.info(`Mulligan activated: You may discard up to ${skillLevel} cards and draw that many`);
    
    // Re-render hand to show discard buttons
    this.renderHand();
    
    return true;
  }

  static async endMulliganComplete() {
    const count = game.user.getFlag(MODULE_ID, 'discardCount') || 0;
    
    // End the Mulligan state
    await game.user.unsetFlag(MODULE_ID, 'mulliganActive');
    await game.user.unsetFlag(MODULE_ID, 'discardLimit');
    await game.user.unsetFlag(MODULE_ID, 'discardCount');
    
    // Remove the Mulligan indicator
    const indicator = document.querySelector('.fu-mulligan-indicator');
    if (indicator) indicator.remove();
    
    // Show notification
    if (count > 0) {
      ui.notifications.info(`Mulligan completed: Discarded ${count} cards and drew ${count} new cards`);
    }
    
    // Re-render hand to update UI
    this.renderHand();
  }

  static async endMulligan() {
    await this.endMulliganComplete();
    
    // Show specific cancellation message
    ui.notifications.info(`Mulligan cancelled`);
  }
  
  // Initialize the UI manager
  static initialize() {
    this.playerColorCache = new Map();
    this.activeTooltips = new Set();
  }


}

// Initialize the class when imported
UIManager.initialize();