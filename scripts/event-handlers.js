// scripts/event-handlers.js
import { MODULE_ID } from './settings.js';
import { UIManager } from './ui-manager.js';
import { CardController } from './card-controller.js';
import { PileManager } from './pile-manager.js';
import { SET_NAMES } from './set-detector.js';
import { hideSetTooltip, clearHighlights } from './ui-enhancements.js';

export class EventHandlers {
  
  // Initialize all event handlers
  static initialize() {
    console.log(`${MODULE_ID} | Initializing event handlers`);
    
    // Store active tooltips for cleanup
    this.activeTooltips = new Set();
    
    // Setup event handlers once DOM is ready
    $(document).ready(() => {
      this.setupButtonHandlers();
      this.setupTooltipHandlers();
      this.setupCardInteractionHandlers();
      this.setupGlobalEvents();
    });
    
    return true;
  }
  
  // Setup handlers for UI buttons
  static setupButtonHandlers() {
    // Button handler: Clean Table
    const btnClean = document.getElementById('fu-clean-table');
    if (btnClean) {
      const cleanTable = () => CardController.cleanTable();
      btnClean.addEventListener('click', cleanTable);
      btnClean._cleanup = () => btnClean.removeEventListener('click', cleanTable);
    }
    
    // Button handler: Draw Card
    const btnDraw = document.getElementById('fu-draw-card');
    if (btnDraw) {
      const drawCard = () => CardController.drawCard();
      btnDraw.addEventListener('click', drawCard);
      btnDraw._cleanup = () => btnDraw.removeEventListener('click', drawCard);
    }
    
    // Button handler: Reset Hand
    const btnReset = document.getElementById('fu-reset-hand');
    if (btnReset) {
      const resetHand = () => CardController.resetHand();
      btnReset.addEventListener('click', resetHand);
      btnReset._cleanup = () => btnReset.removeEventListener('click', resetHand);
    }

     // Button handler: Discard Selected
    const btnDiscardSelected = document.getElementById('fu-discard-selected');
    if (btnDiscardSelected) {
      const discardSelected = () => CardController.discardSelectedCard();
      btnDiscardSelected.addEventListener('click', discardSelected);
      btnDiscardSelected.disabled = true; // Start disabled
      btnDiscardSelected._cleanup = () => btnDiscardSelected.removeEventListener('click', discardSelected);
    }
  }
  
  // Setup handlers for tooltips
  static setupTooltipHandlers() {
    // Set up event listeners for tooltips
    document.addEventListener('mouseenter', this.handleTooltipMouseEnter.bind(this), true);
    document.addEventListener('mouseleave', this.handleTooltipMouseLeave.bind(this), true);
  }
  
  // Handle mouseenter for tooltips
  static handleTooltipMouseEnter(e) {
    // Find the closest .fu-set-indicator ancestor
    let indicator = null;
    let element = e.target;
    
    // Manual traversal up the DOM tree
    while (element && !indicator) {
      if (element.classList && element.classList.contains('fu-set-indicator')) {
        indicator = element;
      }
      element = element.parentElement;
    }
    
    if (indicator) {
      let containerType = null;
      // Check if it's in the hand area
      let parent = indicator;
      while (parent && !containerType) {
        if (parent.id === 'fu-hand-area') {
          containerType = 'hand';
        } else if (parent.id === 'fu-table-area') {
          containerType = 'table';
        }
        parent = parent.parentElement;
      }
      
      if (containerType === 'hand') {
        // Show tooltip for hand sets
        const tooltip = window.FuAceCards.showSetTooltip(indicator, containerType);
        if (tooltip) {
          this.activeTooltips.add(tooltip);
        }
      } else if (containerType === 'table') {
        // For table sets, just highlight the cards
        const cardIds = indicator.dataset.cardIds.split(',');
        const setType = indicator.dataset.setType;
        
        cardIds.forEach(cardId => {
          const cardElement = document.querySelector(`#fu-table-cards [data-card-id="${cardId}"]`);
          if (cardElement) {
            cardElement.classList.add('fu-valid-set', `fu-table-${setType}`);
          }
        });
      }
    }
  }
  
  // Handle mouseleave for tooltips
  static handleTooltipMouseLeave(e) {
    // Use the same manual traversal approach as in mouseenter
    let indicator = null;
    let element = e.target;
    
    // Manual traversal up the DOM tree
    while (element && !indicator) {
      if (element.classList && element.classList.contains('fu-set-indicator')) {
        indicator = element;
      }
      element = element.parentElement;
    }
    
    if (indicator) {
        hideSetTooltip(indicator);
      
      // Also clear highlights for table sets
      let isInTableArea = false;
      let parent = indicator;
      while (parent) {
        if (parent.id === 'fu-table-area') {
          isInTableArea = true;
          break;
        }
        parent = parent.parentElement;
      }
      
    if (isInTableArea) {
      clearHighlights();
      }
    }
  }
  
  // Setup drawer behavior for hand area
  static setupHandDrawer() {
    const handArea = document.getElementById('fu-hand-area');
    if (!handArea) return;
    
    // Track timeout for cleanup
    let drawerTimeout;
    
    const openDrawer = () => {
      clearTimeout(drawerTimeout);
      handArea.classList.add('open');
    };
    
    const closeDrawer = () => {
      drawerTimeout = setTimeout(() => {
        handArea.classList.remove('open');
      }, 1000);
    };
    
    handArea.addEventListener('mouseenter', openDrawer);
    handArea.addEventListener('mouseleave', closeDrawer);
    
    // Store cleanup function for later
    handArea._cleanupDrawer = () => {
      clearTimeout(drawerTimeout);
      handArea.removeEventListener('mouseenter', openDrawer);
      handArea.removeEventListener('mouseleave', closeDrawer);
    };
  }
  
  // Setup handlers for card interactions
  static setupCardInteractionHandlers() {
    // This is handled dynamically when cards are rendered
    // See UIManager.renderHand() and UIManager.renderTable()
  }
  
  // Setup global event handlers
  static setupGlobalEvents() {
    // Handle global events that should clean up tooltips
    document.addEventListener('click', (e) => {
      // Don't clean up if clicking on a set indicator or a card
      if (e.target.closest('.fu-set-indicator') || e.target.closest('.fu-card')) {
        return;
      }
      
      // Otherwise clean up tooltips
      UIManager.cleanupAllTooltips();
    });
  }
  
  // Handle clicking a set indicator in hand
  static handleHandSetClick(indicator) {
    // Only handle clicks on available sets
    if (!indicator.classList.contains('available')) {
      return;
    }
    
    const setType = indicator.dataset.setType;
    const cardIds = indicator.dataset.cardIds.split(',');
    
    // Create set data
    const setData = {
      type: setType,
      name: window.FuAceCards.SET_NAMES[setType],
      cardIds: cardIds
    };
    
    CardController.playSetToTable(setData, indicator);
  }
  
  // Handle clicking a set indicator on table
  static handleTableSetClick(indicator) {
    // Only handle clicks on own sets
    if (!indicator.classList.contains('own-set')) {
      return;
    }
    
    const setType = indicator.dataset.setType;
    const cardIds = indicator.dataset.cardIds.split(',');
    const playerId = indicator.dataset.playerId;
    
    // Clean up tooltips before activation
    UIManager.cleanupAllTooltips();
    
    // Get the actual cards
    const tablePile = PileManager.getTablePile();
    const cards = cardIds.map(id => tablePile.cards.get(id)).filter(Boolean);
    
    // Create set data
    const setData = {
        type: setType,
        name: SET_NAMES[setType] || setType,
        cards: cards,
        cardIds: cardIds,
        values: cards.map(c => window.FuAceCards.getCardValue(c))
    };
    
    CardController.activateTableSet(setData, playerId);
  }
  
  // Setup chat message interaction handlers
  static setupChatMessageHandlers() {
    Hooks.on('renderChatMessage', (message, html) => {
      // Check if this is a card set message
      const messageContent = html.find('.fu-chat-cards-container');
      if (messageContent.length > 0) {
        // Check if this is a Double Trouble set specifically
        const isDoubleTrouble = html.find('[data-set-type="double-trouble"]').length > 0;
        
        if (isDoubleTrouble) {
          this.setupDoubleTroubleCardSelection(html);
        }
        
        this.setupDamageButtons(html);
        this.setupResourceButtons(html);
      }
    });
  }
  
  // Setup Double Trouble card selection in chat
  static setupDoubleTroubleCardSelection(html) {
    // Find the cards in this message
    const cardImages = html.find('.fu-chat-card-img');
    
    // Add clickable class to all cards
    cardImages.addClass('fu-card-clickable');
    
    // Define the mapping for damage types to icon classes
    const damageTypeToIconClass = {
      'fire': 'fu-fire',
      'air': 'fu-wind',   // Special case: air damage uses fu-wind icon class
      'earth': 'fu-earth',
      'ice': 'fu-ice',
      'light': 'fu-light',
      'dark': 'fu-dark'
    };
    
    // Add click handler to each card
    cardImages.on('click', function(event) {
      const cardElement = $(this);
      let cardSuit = cardElement.data('card-suit');
      
      // If suit data not directly available, try to extract from the card name
      if (!cardSuit) {
        const cardName = cardElement.attr('title') || '';
        // Extract suit from name (hearts, diamonds, clubs, spades)
        const suitMatch = cardName.toLowerCase().match(/(heart|diamond|club|spade)s?/);
        cardSuit = suitMatch ? suitMatch[0] : '';
      }
      
      // Map suit to damage type based on the standard mapping
      const suitToDamageType = {
        'hearts': 'fire',
        'heart': 'fire',
        'diamonds': 'air',
        'diamond': 'air',
        'clubs': 'earth',
        'club': 'earth',
        'spades': 'ice',
        'spade': 'ice'
      };
      
      const damageType = suitToDamageType[cardSuit.toLowerCase()] || cardSuit;
      
      // Remove selected class from any previously selected card
      cardImages.removeClass('fu-selected-card');
      
      // Add selected class to this card
      cardElement.addClass('fu-selected-card');
      
      // Update the damage button with the selected damage type
      const damageButton = html.find('[data-action="applyDamageSelected"]');
      if (damageButton.length) {
        // Update damage type attribute
        damageButton.attr('data-damage-type', damageType);
        
        // Get a display name for the damage type
        const damageTypeDisplay = CONFIG.projectfu?.damageTypes?.[damageType] || damageType.toUpperCase();
        
        // Update the button text
        damageButton.find('span').html(`Apply ${damageTypeDisplay} damage <i class="icon fas fa-heart-crack"></i>`);
      }
      
      // Update the system's damage label (the one you shared in the DOM)
      const damageLabel = html.find('.damageType');
      if (damageLabel.length) {
        // Remove existing damage type classes
        damageLabel.removeClass('fire ice earth air light dark');
        
        // Add the new damage type class
        damageLabel.addClass(damageType);
        
        // Update tooltip for endcap
        const endcap = damageLabel.find('.endcap');
        if (endcap.length) {
          const damageTypeDisplay = CONFIG.projectfu?.damageTypes?.[damageType] || 
                                  damageType.charAt(0).toUpperCase() + damageType.slice(1);
          endcap.attr('data-tooltip', damageTypeDisplay);
          
          // Use the correct icon class based on damage type
          const iconClass = damageTypeToIconClass[damageType] || `fu-${damageType}`;
          endcap.html(`<i class="fua ${iconClass}"></i>`);
        }
      }
    });
    
    // Initialize the apply damage button to indicate selection is needed
    const damageButton = html.find('[data-action="applyDamageSelected"]');
    if (damageButton.length) {
      damageButton.find('span').html(`Select damage type <i class="icon fas fa-heart-crack"></i>`);
    }
  }
  
  // Setup damage buttons in chat
  static setupDamageButtons(html) {
    html.find('[data-action="applyDamageSelected"]').click(async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const damageType = button.dataset.damageType;
      const damageValue = parseInt(button.dataset.damageValue);
      const setType = button.dataset.setType;
      const playerId = button.dataset.playerId;
      
      // For Double Trouble, verify a card has been selected
      if (setType === 'double-trouble' && !html.find('.fu-selected-card').length) {
        ui.notifications.warn("Please select a card to determine damage type first.");
        return;
      }
      
      // Get targeted tokens (for enemies)
      const targetedTokens = Array.from(game.user.targets);
      if (targetedTokens.length === 0) {
        ui.notifications.warn("No targets selected. Use the targeting tool to target enemies.");
        return;
      }
      
      // Get target actors from tokens
      const targets = targetedTokens.map(token => token.actor).filter(Boolean);
      
      // Get source actor - try to find a valid source
      let sourceActor = null;
      
      // First try to get the character from the player ID
      if (playerId) {
        const player = game.users.get(playerId);
        if (player && player.character) {
          sourceActor = player.character;
        }
      }
      
      // If we couldn't find the source actor from player ID, try the current user
      if (!sourceActor && game.user.character) {
        sourceActor = game.user.character;
      }
      
      // If we still don't have a source actor, use a basic object
      if (!sourceActor) {
        sourceActor = {
          name: "Card Effect",
          id: "card-effect",
          // Minimal implementation to prevent errors
          get uuid() { return "fu-ace-cards.card-effect"; }
        };
      }
      
      // Determine traits based on event modifiers and set type
      const traits = [];
      if (event.shiftKey) traits.push('ignoreResistances');
      if (event.ctrlKey && event.shiftKey) traits.push('ignoreImmunities');
      if (setType === 'forbidden-monarch') {
        traits.push('ignoreResistances');
        traits.push('ignoreImmunities');
      }
      
      try {
        // Use our integration to apply damage with better error handling
        await window.FuAceCards.DamageIntegration.applyDamage(
          damageType,
          damageValue,
          sourceActor,
          targets,
          traits
        );
        
        // Disable the button after application
        button.classList.add("disabled");
        $(button).find("span").text(`Damage Applied (${damageValue})`);
      } catch (error) {
        console.error("Error applying damage:", error);
        ui.notifications.error("Failed to apply damage: " + error.message);
      }
    });
  }
  
  // Setup resource (MP) spending buttons in chat
  static setupResourceButtons(html) {
    html.find('[data-action="applyResourceLoss"]').click(async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const actorId = button.dataset.actor;
      const amount = parseInt(button.dataset.amount);
      const resource = button.dataset.resource;
      
      if (actorId && amount && resource) {
        const actor = game.actors.get(actorId);
        if (actor) {
          // Modify the actor's MP
          await actor.update({
            "system.resources.mp.value": Math.max(0, actor.system.resources.mp.value - amount)
          });

          // Disable the button after spending
          button.classList.add("disabled");
          $(button).find("span").text(`MP Spent (${amount})`);
          
          // Show notification
          ui.notifications.info(`${actor.name} spent ${amount} MP`);
        }
      }
    });
  }
  
  // Clean up all event handlers
  static cleanup() {
    const btnClean = document.getElementById('fu-clean-table');
    const btnDraw = document.getElementById('fu-draw-card');
    const btnReset = document.getElementById('fu-reset-hand');
    const handArea = document.getElementById('fu-hand-area');
    
    btnClean?._cleanup?.();
    btnDraw?._cleanup?.();
    btnReset?._cleanup?.();
    handArea?._cleanupDrawer?.();
    
    // Remove document event listeners
    document.removeEventListener('mouseenter', this.handleTooltipMouseEnter);
    document.removeEventListener('mouseleave', this.handleTooltipMouseLeave);
    
    console.log(`${MODULE_ID} | Event handlers cleaned up`);
  }
}