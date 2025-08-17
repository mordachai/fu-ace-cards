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
  console.log('renderTable() called');
  const tableArea = document.getElementById('fu-table-area');
  const tablePile = getTablePile();
  const toggleButton = document.getElementById('fu-table-toggle');
  
  console.log('Table pile found:', !!tablePile);
  console.log('Cards in table pile:', tablePile?.cards?.size);
  
  if (!tablePile) {
    console.log('No table pile, returning');
    return;
  }
      
  const cards = tablePile.cards;
  const isHidden = game.settings.get(MODULE_ID, 'tableAreaHidden');
  const cardCount = cards.size;

  console.log('Card count:', cardCount);
  console.log('Is hidden setting:', isHidden);

  // Hide the entire table area if empty or setting is hidden
  if (cardCount === 0 || isHidden) {
    console.log('Exiting early - empty or hidden');
    tableArea.style.display = 'none';
    return;
  }   

  console.log('Continuing to render cards...');
// Otherwise make sure it's visible
tableArea.style.display = 'flex';

// Now render the cards
const container = document.getElementById('fu-table-cards');
container.innerHTML = ''; // Clear existing cards to prevent duplication

for (const c of cards) {
  const d = document.createElement('div');
  d.className = 'fu-card';
  d.style.backgroundImage = `url(${c.faces[c.face ?? 0]?.img})`;
  d.dataset.cardId = c.id;
  
  // Add to the container
  container.appendChild(d);
}

      console.log('Container now has', container.children.length, 'children');
      
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
              // Get current count and limit directly to avoid stale values
              const currentCount = game.user.getFlag(MODULE_ID, 'discardCount') || 0;
              const currentLimit = game.user.getFlag(MODULE_ID, 'discardLimit') || 0;
              
              const newCount = currentCount + 1;
              console.log(`${MODULE_ID} | Mulligan discard: ${newCount}/${currentLimit}`);
              
              // Update the flag first
              await game.user.setFlag(MODULE_ID, 'discardCount', newCount);
              
              // Draw a card for Mulligan
              await window.FuAceCards.CardController.drawCard();
              
              // Check if we've hit the limit
              if (newCount >= currentLimit) {
                console.log(`${MODULE_ID} | Reached discard limit (${newCount}/${currentLimit}). Ending Mulligan.`);
                // Force endMulligan to complete with a small delay to ensure flags are updated
                setTimeout(() => UIManager.endMulliganComplete(), 100);
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
          console.log('Using CardController path');
          await window.FuAceCards.CardController.playCardToTable(c);
          
          // Force table to show immediately
          const tableArea = document.getElementById('fu-table-area');
          if (tableArea) {
            tableArea.style.display = 'flex';
            console.log('Forced table display to flex');
          }
          
          console.log('About to call renderTable');
          this.renderTable();
          console.log('renderTable called');
        } else {
          console.log('Using fallback path');
          // Direct fallback implementation in case CardController isn't available
          console.warn(`${MODULE_ID} | CardController not found, using fallback implementation`);
          try {
            const tablePile = getTablePile();
            if (tablePile) {
              await hand.pass(tablePile, [c.id], { chatNotification: false });
              
              // Force table to show immediately
              const tableArea = document.getElementById('fu-table-area');
              if (tableArea) {
                tableArea.style.display = 'flex';
                console.log('Forced table display to flex (fallback)');
              }
              
              this.renderHand();
              this.renderTable();
            }
          } catch (error) {
            console.error("Error playing card:", error);
            this.renderHand();
          }
        }
      });
      console.log(`Click handler added to card ${c.id}`);
      
      // Apply player color
      this.applyPlayerColor(d, c);
      
      handCards.appendChild(d);
    }
    
    // Update set info bar for hand with click handler
    if (hand.cards.size >= 0) {
      // Check if window.FuAceCards exists and has handleHandSetClick method
      const handleSetClick = window.FuAceCards?.handleHandSetClick || 
                          ((indicator) => console.warn(`${MODULE_ID} | handleHandSetClick not found`));
      
      updateSetInfoBar(Array.from(hand.cards), 'hand', handleSetClick);
    }
    
    // Verify handlers are present - ADDED
    this.ensureHandAreaFunctional();
  }
  
  // Show the hand area
  static showHandArea() {
    const handArea = document.getElementById('fu-hand-area');
    if (!handArea) return;
    
    // Verify event handlers are present - ADDED
    this.ensureHandAreaFunctional();
    
    // Ensure area is visible
    handArea.classList.add('open');
    
    // Clear any existing timeout
    clearTimeout(handArea._autoCloseTimeout);
    
    // Set new timeout for auto-close
    handArea._autoCloseTimeout = setTimeout(() => {
      handArea.classList.remove('open');
    }, 10000);
  }

  // Add to scripts/card-controller.js
  static async returnCardToHand(cardId) {
    const tablePile = getTablePile();
    const piles = getCurrentPlayerPiles();
    
    if (!tablePile || !piles?.hand) {
      ui.notifications.warn("Cannot return card: piles not found");
      return false;
    }
    
    // Find the card on the table
    const card = tablePile.cards.get(cardId);
    if (!card) {
      console.error(`${MODULE_ID} | Card ${cardId} not found on table`);
      return false;
    }
    
    // Check if this card belongs to the current player
    const ownerId = card.getFlag(MODULE_ID, 'ownerId');
    if (ownerId !== game.userId) {
      ui.notifications.warn("You can only return your own cards to hand");
      return false;
    }
    
    try {
      // Pass the card from table to hand
      await tablePile.pass(piles.hand, [cardId], { chatNotification: false });
      
      // Update UI
      UIManager.renderTable();
      UIManager.renderHand();
      
      return true;
    } catch (error) {
      console.error("Error returning card to hand:", error);
      return false;
    }
  }

  // Add new method to ensure handlers exist - ADDED
  static ensureHandAreaFunctional() {
    if (window.FuAceCards?.EventHandlers) {
      window.FuAceCards.EventHandlers.verifyHandDrawerHandlers();
    } else if (typeof EventHandlers !== 'undefined') {
      EventHandlers.verifyHandDrawerHandlers();
    }
  }

  // Setup DOM change detection - ADDED
  static setupDomChangeDetection() {
    // Only create the observer if it doesn't exist
    if (!this.domObserver && typeof MutationObserver !== 'undefined') {
      this.domObserver = new MutationObserver((mutations) => {
        let handAreaAffected = false;
        
        // Check if any mutations affected the hand area or its ancestors
        for (const mutation of mutations) {
          // Check if mutation directly affects hand area
          if (mutation.target.id === 'fu-hand-area') {
            handAreaAffected = true;
            break;
          }
          
          // Check if any added/removed nodes contain or are hand area
          if (mutation.addedNodes.length || mutation.removedNodes.length) {
            const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
            for (const node of changedNodes) {
              if (node.id === 'fu-hand-area' || 
                  (node.contains && node.contains(document.getElementById('fu-hand-area')))) {
                handAreaAffected = true;
                break;
              }
            }
          }
          
          // Check if mutation is an attribute change on a parent of hand area
          if (mutation.type === 'attributes') {
            const handArea = document.getElementById('fu-hand-area');
            if (handArea && (mutation.target.contains(handArea) || handArea.contains(mutation.target))) {
              handAreaAffected = true;
              break;
            }
          }
        }
        
        // If hand area was affected, ensure handlers are attached
        if (handAreaAffected) {
          this.ensureHandAreaFunctional();
        }
      });
      
      // Start observing once DOM is ready
      setTimeout(() => {
        const handArea = document.getElementById('fu-hand-area');
        if (handArea) {
          this.domObserver.observe(document.body, { 
            childList: true, 
            subtree: true,
            attributes: true
          });
          console.log(`${MODULE_ID} | DOM observer for hand area initialized`);
        }
      }, 500);
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
  
  // Clean up all tooltips - MODIFIED
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
    
    // Verify hand area functionality - ADDED
    this.ensureHandAreaFunctional();
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
    
    // Look for direct Mulligan skill first
    const mulliganSkill = actor.items.find(i => i.name === "Mulligan" && i.type === "skill");
    
    // Then check for Magic Cards level 5+ as fallback
    const magicCardsSkill = actor.items.find(i => 
      i.name === "Magic Cards" && 
      i.type === "skill" && 
      i.system.level.value >= 5
    );
    
    // Determine skill level
    let skillLevel = 0;
    
    if (mulliganSkill) {
      // Use direct Mulligan level
      skillLevel = mulliganSkill.system.level.value;
    } else if (magicCardsSkill) {
      // Magic Cards level 5+ grants Mulligan level 1
      skillLevel = 1;
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
    
    // Ensure hand area is functional
    this.ensureHandAreaFunctional();
    
    return true;
  }

  static async endMulliganComplete() {
    console.log(`${MODULE_ID} | Ending Mulligan mode completely`);
    
    // Get current counts for logging
    const count = game.user.getFlag(MODULE_ID, 'discardCount') || 0;
    const limit = game.user.getFlag(MODULE_ID, 'discardLimit') || 0;
    console.log(`${MODULE_ID} | Final Mulligan stats: ${count}/${limit} cards discarded`);
    
    // End the Mulligan state - use setFlag(false) instead of unsetFlag for reliability
    await game.user.setFlag(MODULE_ID, 'mulliganActive', false);
    await game.user.setFlag(MODULE_ID, 'discardCount', 0);
    await game.user.setFlag(MODULE_ID, 'discardLimit', 0);
    
    // Double-check flags were cleared correctly
    setTimeout(async () => {
      const checkActive = game.user.getFlag(MODULE_ID, 'mulliganActive');
      if (checkActive) {
        console.warn(`${MODULE_ID} | Mulligan flag still active after clearing! Forcing unset...`);
        await game.user.unsetFlag(MODULE_ID, 'mulliganActive');
      }
    }, 200);
    
    // Remove the Mulligan indicator
    const indicator = document.querySelector('.fu-mulligan-indicator');
    if (indicator) indicator.remove();
    
    // Show notification
    if (count > 0) {
      ui.notifications.info(`Mulligan completed: Discarded ${count} cards and drew ${count} new cards`);
    }
    
    // Re-render hand to update UI
    this.renderHand();
    
    // Ensure hand area is functional
    this.ensureHandAreaFunctional();
  }

  static async endMulligan() {
    await this.endMulliganComplete();
    
    // Show specific cancellation message
    ui.notifications.info(`Mulligan cancelled`);
  }  

  static initialize() {
    this.playerColorCache = new Map();
    this.activeTooltips = new Set();
    
    // Register the MutationObserver to detect DOM changes - ADDED
    this.setupDomChangeDetection();
  }
}

// Initialize the class when imported
UIManager.initialize();