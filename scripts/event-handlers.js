// scripts/event-handlers.js
import { MODULE_ID } from './settings.js';
import { UIManager } from './ui-manager.js';
import { CardController } from './card-controller.js';
import { PileManager } from './pile-manager.js';
import { getTablePile, getCurrentPlayerPiles } from './pile-manager.js'; // Add getTablePile here
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
    // Button handler: Draw Card
    const btnDraw = document.getElementById('fu-draw-card');
    if (btnDraw) {
      // Clean up existing handler if present
      if (btnDraw._drawCard) {
        btnDraw.removeEventListener('click', btnDraw._drawCard);
      }
      
      const drawCard = () => CardController.drawCard();
      btnDraw.addEventListener('click', drawCard);
      btnDraw._drawCard = drawCard;
      btnDraw._hasEventHandlers = true;
      
      btnDraw._cleanup = () => {
        btnDraw.removeEventListener('click', drawCard);
        btnDraw._hasEventHandlers = false;
      };
    }

    // Button handler: Mulligan
    const btnMulligan = document.getElementById('fu-mulligan');
    if (btnMulligan) {
      // Clean up existing handler if present
      if (btnMulligan._performMulligan) {
        btnMulligan.removeEventListener('click', btnMulligan._performMulligan);
      }
      
      const performMulligan = async () => {
        // Get current state with explicit boolean conversion
        const isActive = !!game.user.getFlag(MODULE_ID, 'mulliganActive');
        console.log(`${MODULE_ID} | Mulligan button clicked. Current state:`, isActive);
        
        if (isActive) {
          // Cancel Mulligan if already active
          console.log(`${MODULE_ID} | Ending Mulligan mode`);
          await UIManager.endMulligan();
        } else {
          // Start Mulligan
          console.log(`${MODULE_ID} | Starting Mulligan mode`);
          await UIManager.startMulligan();
        }
      };
      
      btnMulligan.addEventListener('click', performMulligan);
      btnMulligan._performMulligan = performMulligan;
      btnMulligan._hasEventHandlers = true;
      
      btnMulligan._cleanup = () => {
        btnMulligan.removeEventListener('click', performMulligan);
        btnMulligan._hasEventHandlers = false;
      };
    }

    // Button handler: Manual Reset
    const btnManualReset = document.getElementById('fu-manual-reset');
    if (btnManualReset) {
      // Clean up existing handler if present
      if (btnManualReset._resetHandler) {
        btnManualReset.removeEventListener('click', btnManualReset._resetHandler);
      }
      
      const resetHandler = () => this.manualReset();
      btnManualReset.addEventListener('click', resetHandler);
      btnManualReset._resetHandler = resetHandler;
      btnManualReset._hasEventHandlers = true;
      
      btnManualReset._cleanup = () => {
        btnManualReset.removeEventListener('click', resetHandler);
        btnManualReset._hasEventHandlers = false;
      };
    }
    
    console.log(`${MODULE_ID} | Button handlers setup complete`);
  }

  // Add verification method
  static verifyAllHandlers() {
    // Check all button handlers
    this.setupButtonHandlers();
    
    // Also verify hand drawer
    this.verifyHandDrawerHandlers();
    
    return true;
  }

  // Add to event-handlers.js
  static async manualReset() {
    // Create a confirmation dialog with updated description
    const confirm = await Dialog.confirm({
      title: "Clean Table",
      content: `<p>This will clear all cards from the table. Player hands will remain unchanged.</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    
    if (!confirm) return;
    
    ui.notifications.info("Cleaning table area...");
    
    // Only clean the table
    await CardController.cleanTable();
    
    // Render UI
    UIManager.renderTable();
    
    // Verify ALL handlers, not just hand drawer
    this.verifyHandDrawerHandlers();
    this.setupButtonHandlers(); // Add this line to reattach button handlers
    
    ui.notifications.info("Table area has been cleaned");
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
  
  // Clean up existing event handlers
  this.cleanupHandDrawer();
  
  // Create handle element if it doesn't exist
  let handleElement = handArea.querySelector('.fu-drawer-handle');
  if (!handleElement) {
    handleElement = document.createElement('div');
    handleElement.className = 'fu-drawer-handle';
    handArea.prepend(handleElement);
  }
  
  // Track state
  handArea._isLocked = false;
  
  // Toggle function - keeps drawer open/closed until clicked again
  const toggleDrawer = (event) => {
    // Prevent event from bubbling
    event.stopPropagation();
    
    // Toggle locked state
    handArea._isLocked = !handArea._isLocked;
    
    // Toggle drawer based on locked state
    if (handArea._isLocked) {
      handArea.classList.add('open', 'locked');
    } else {
      handArea.classList.remove('open', 'locked');
    }
    
    console.log(`${MODULE_ID} | Hand drawer: ${handArea._isLocked ? 'locked open' : 'closed'}`);
  };
  
  // Hover functions still work when not locked
  const openDrawer = () => {
    if (!handArea._isLocked) {
      console.log(`${MODULE_ID} | Hand drawer: hover open`);
      clearTimeout(handArea._drawerTimeout);
      handArea.classList.add('open');
    }
  };
  
  const closeDrawer = () => {
    if (!handArea._isLocked) {
      console.log(`${MODULE_ID} | Hand drawer: hover close pending`);
      handArea._drawerTimeout = setTimeout(() => {
        handArea.classList.remove('open');
        console.log(`${MODULE_ID} | Hand drawer: hover closed`);
      }, 1000);
    }
  };
  
  // Store handlers on element for cleanup
  handleElement._toggleDrawer = toggleDrawer;
  handArea._openDrawer = openDrawer;
  handArea._closeDrawer = closeDrawer;
  
  // Add click event to handle
  handleElement.addEventListener('click', toggleDrawer);
  
  // Add hover events to drawer (only work when not locked)
  handArea.addEventListener('mouseenter', openDrawer);
  handArea.addEventListener('mouseleave', closeDrawer);
  
  // Set flag for event tracking
  handArea._hasEventHandlers = true;
  
  console.log(`${MODULE_ID} | Hand drawer event handlers attached`);
  
  // Store cleanup function
  handArea._cleanupDrawer = () => {
    this.cleanupHandDrawer();
  };
}

  // Updated cleanupHandDrawer method
  static cleanupHandDrawer() {
    const handArea = document.getElementById('fu-hand-area');
    if (!handArea) return;
    
    // Get handle element
    const handleElement = handArea.querySelector('.fu-drawer-handle');
    
    // Clean up click handler on handle
    if (handleElement && handleElement._toggleDrawer) {
      handleElement.removeEventListener('click', handleElement._toggleDrawer);
    }
    
    // Clean up hover handlers
    if (handArea._openDrawer) {
      handArea.removeEventListener('mouseenter', handArea._openDrawer);
    }
    
    if (handArea._closeDrawer) {
      handArea.removeEventListener('mouseleave', handArea._closeDrawer);
      clearTimeout(handArea._drawerTimeout);
    }
    
    // Reset flags
    handArea._hasEventHandlers = false;
    handArea._isLocked = false;
    
    console.log(`${MODULE_ID} | Hand drawer event handlers removed`);
  }
  
  // Verify and restore event handlers if needed
  static verifyHandDrawerHandlers() {
    const handArea = document.getElementById('fu-hand-area');
    if (!handArea) return false;
    
    // Check if handlers are attached
    if (!handArea._hasEventHandlers) {
      console.log(`${MODULE_ID} | Hand drawer event handlers missing, restoring...`);
      this.setupHandDrawer();
      return true;
    }
    
    return false;
  }
  
  // Setup card interaction handlers
  static setupCardInteractionHandlers() {
    // This is handled dynamically when cards are rendered
    // See UIManager.renderHand() and UIManager.renderTable()
    
    // This function mostly exists as a placeholder for organization
    // The actual event handlers are attached when cards are created
    console.log(`${MODULE_ID} | Card interaction handlers will be added dynamically`);
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
    
    // Listen for Escape key to close hand area if open
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const handArea = document.getElementById('fu-hand-area');
        if (handArea && handArea.classList.contains('open')) {
          handArea.classList.remove('open');
        }
      }
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
    Hooks.on('renderChatMessage', (message, html, data) => {
      // Check if this is a card set message
      const messageContent = html.find('.fu-chat-cards-container');
      if (messageContent.length > 0) {
        console.log(`${MODULE_ID} | Processing chat message with card container`);
        
        // Check for set types using either data attribute or section class
        const isDoubleTrouble = html.find('[data-set-type="double-trouble"]').length > 0;
        const isMagicPair = html.find('[data-set-type="magic-pair"]').length > 0 || 
                          html.find('.weapon-attack-check').length > 0;
        
        console.log(`${MODULE_ID} | Message contains: Double Trouble: ${isDoubleTrouble}, Magic Pair: ${isMagicPair}`);
        
        if (isDoubleTrouble) {
          this.setupDoubleTroubleCardSelection(html);
        }
        
        if (isMagicPair) {
          this.setupMagicPairCardSelection(html);
        }
        
        this.setupDamageButtons(html);
        this.setupResourceButtons(html);
        this.setupHealingButtons(html);
      }
      
      // Also check for healing result messages
      if (html.find('.fu-healing-results, .fu-status-results').length > 0) {
        this.setupHealingResultHandlers(html);
      }
    });
  }

  // Setup healing buttons in chat messages
  static setupHealingButtons(html) {
    // Make sure we have jQuery object
    const $html = html instanceof jQuery ? html : $(html);

    // Handle healing allocation buttons
    $html.find('[data-action="allocateHealing"]').click(async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const setType = button.dataset.setType;
      const totalValue = parseInt(button.dataset.value || '0');
      const playerId = button.dataset.playerId;
      
      console.log(`${MODULE_ID} | Healing Button Clicked | Set Type: ${setType}, Total Value: ${totalValue}`);
      
      // Disable the button while processing
      button.disabled = true;
      $(button).find("span").text("Processing...");
      
      // Get player character
      const player = game.users.get(playerId);
      const character = player?.character;
      
      if (!character) {
        ui.notifications.error("Could not find character associated with this effect");
        button.disabled = false;
        $(button).find("span").text("Retry Healing");
        return;
      }
      
      // Get target tokens and their actors
      const targets = Array.from(game.user.targets)
        .filter(t => t.actor)
        .map(t => t.actor);
      
      // Add the character to targets if not already included
      if (!targets.some(t => t.id === character.id)) {
        targets.unshift(character);
        console.log(`${MODULE_ID} | Added character to targets`);
      }
      
      console.log(`${MODULE_ID} | Processing targets:`, targets.map(t => t.name));
      
      if (targets.length === 0) {
        ui.notifications.warn("No targets selected. Use the targeting tool to select allies.");
        button.disabled = false;
        $(button).find("span").text("Select Targets");
        return;
      }
      
      try {
        // Check if HealingIntegration is available
        if (!window.FuAceCards?.HealingIntegration) {
          ui.notifications.error("Healing integration not available");
          button.disabled = false;
          $(button).find("span").text("Retry Healing");
          return;
        }
        
        let result;
        
        // Apply healing based on set type
        switch (setType) {
          case 'triple-support':
            result = await window.FuAceCards.HealingIntegration.applyTripleSupportHealing(
              totalValue,
              character,
              targets
            );
            break;
            
          case 'jackpot':
            result = await window.FuAceCards.HealingIntegration.applyJackpotHealing(
              character,
              targets
            );
            break;
            
          default:
            ui.notifications.warn(`Unknown healing set type: ${setType}`);
            result = { applied: false };
        }
        
        // Update button state based on result
        if (result && result.applied) {
          button.classList.add("disabled");
          button.disabled = true;
          $(button).find("span").text(`Healing Applied`);
        } else {
          button.disabled = false;
          $(button).find("span").text(`Retry Healing`);
        }
      } catch (error) {
        console.error("Error applying healing:", error);
        ui.notifications.error("Failed to apply healing: " + error.message);
        button.disabled = false;
        $(button).find("span").text(`Retry Healing`);
      }
    });
    
    // Handle status effect buttons
    html.find('[data-action="applyStatusEffects"]').click(async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const highestValue = parseInt(button.dataset.highestValue || '0');
      const playerId = button.dataset.playerId;
      
      console.log(`${MODULE_ID} | Status Effect Button Clicked | Highest Value: ${highestValue}`);
      
      // Disable the button while processing
      button.disabled = true;
      $(button).find("span").text("Processing...");
      
      // Get player character
      const player = game.users.get(playerId);
      const character = player?.character;
      
      if (!character) {
        ui.notifications.error("Could not find character associated with this effect");
        button.disabled = false;
        $(button).find("span").text("Retry Status Effects");
        return;
      }
      
      try {
        // Show status effect dialog and process results
        const result = await window.FuAceCards.HealingIntegration.applyFullStatusEffects(
          highestValue,
          character
        );
        
        // Update button state based on result
        if (result && result.applied) {
          button.classList.add("disabled");
          button.disabled = true;
          $(button).find("span").text(`Status Effects Applied`);
        } else {
          button.disabled = false;
          $(button).find("span").text(`Retry Status Effects`);
        }
      } catch (error) {
        console.error("Error applying status effects:", error);
        ui.notifications.error("Failed to apply status effects: " + error.message);
        button.disabled = false;
        $(button).find("span").text(`Retry Status Effects`);
      }
    });
    
    // Add handler for "Select All Allies" button if present
    html.find('[data-action="selectAllAllies"]').click(async (event) => {
      event.preventDefault();
      
      // Deselect all current targets
      game.user.targets.forEach(t => t.setTarget(false, { releaseOthers: false }));
      
      // Select all allied tokens
      let allyCount = 0;
      canvas.tokens.placeables.forEach(token => {
        if (token.actor) {
          token.setTarget(true, { releaseOthers: false });
          allyCount++;
        }
      });
      
      if (allyCount > 0) {
        ui.notifications.info(`Selected ${allyCount} character tokens`);
      } else {
        ui.notifications.warn("No character tokens found on the scene");
      }
    });
  }

  // Handle healing result messages
  static setupHealingResultHandlers(html) {
    // Add handlers for any interactive elements in healing result messages
    html.find('.fu-healing-results .fu-target-status').click(async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const targetId = button.dataset.targetId;
      
      // Highlight the token on the canvas if found
      const token = canvas.tokens.placeables.find(t => 
        t.id === targetId || t.actor?.id === targetId
      );
      
      if (token) {
        // Pan camera to token
        canvas.animatePan({
          x: token.center.x,
          y: token.center.y,
          scale: canvas.stage.scale.x
        });
        
        // Highlight token
        token.control({releaseOthers: true});
      }
    });
  }

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
            damageLabel.removeClass('fire ice earth air light dark physical');
            
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

  // Setup MagicPair card selection in chat
  static setupMagicPairCardSelection(html) {
    // Find the cards in this message
    const cardImages = html.find('.fu-chat-card-img');
    
    // Add clickable class to all cards
    cardImages.addClass('fu-card-clickable');
    
    // Define the mapping for damage types to icon classes
    const damageTypeToIconClass = {
      'fire': 'fu-fire',
      'air': 'fu-wind',
      'earth': 'fu-earth',
      'ice': 'fu-ice',
      'light': 'fu-light',
      'dark': 'fu-dark',
      'physical': 'fu-physical'
    };
    
    // Define suit to damage type mapping
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
    
    // Add click handler to each card
    cardImages.on('click', function(event) {
      const cardElement = $(this);
      let cardSuit = cardElement.data('card-suit');
      
      // Check if there's a phantom suit for jokers
      const phantomSuit = cardElement.data('phantom-suit');
      if (phantomSuit) {
        cardSuit = phantomSuit;
      } else if (!cardSuit) {
        // If no suit data directly available, try to extract from the name
        const cardName = cardElement.attr('title') || '';
        const suitMatch = cardName.toLowerCase().match(/(heart|diamond|club|spade)s?/);
        cardSuit = suitMatch ? suitMatch[0] : '';
      }
      
      // Determine the damage type from the suit
      const damageType = suitToDamageType[cardSuit.toLowerCase()] || 'physical';
      
      // Remove selected class from any previously selected card
      cardImages.removeClass('fu-selected-card');
      
      // Add selected class to this card
      cardElement.addClass('fu-selected-card');
      
      // Specifically target the weapon attack section for Magic Pair
      const weaponLabel = html.find('.weapon-attack-check .damageType');
      if (weaponLabel.length) {
        // Update the damage text with the element type
        const damageText = weaponLabel.find('#weapon-damage-text');
        if (damageText.length) {
          damageText.text(`${window.capitalize(damageType)}`);
        }
        
        // Remove existing damage type classes
        weaponLabel.removeClass('fire ice earth air light dark physical');
        
        // Add the new damage type class
        weaponLabel.addClass(damageType);
        
        // Update tooltip for endcap
        const endcap = weaponLabel.find('.endcap');
        if (endcap.length) {
          const damageTypeDisplay = CONFIG.projectfu?.damageTypes?.[damageType] || 
                                  damageType.charAt(0).toUpperCase() + damageType.slice(1);
          endcap.attr('data-tooltip', `${damageTypeDisplay} Damages`);
          
          // Use the correct icon class based on damage type
          const iconClass = damageTypeToIconClass[damageType] || `fu-${damageType}`;
          endcap.html(`<i class="fua ${iconClass}"></i>`);
        }
        
        // Update instruction text to match the damage type
        const notesText = html.find('.weapon-attack-check .notes');
        if (notesText.length) {
          notesText.html(`Weapon attacks will deal <strong>${damageType}</strong> damage regardless of weapon type.`);
        }
      }
    });
  }

  // Clean up all event handlers
  static cleanup() {
    const btnClean = document.getElementById('fu-clean-table');
    const btnDraw = document.getElementById('fu-draw-card');
    const handArea = document.getElementById('fu-hand-area');
    
    btnClean?._cleanup?.();
    btnDraw?._cleanup?.();
    handArea?._cleanupDrawer?.();
    
    // Remove document event listeners
    document.removeEventListener('mouseenter', this.handleTooltipMouseEnter);
    document.removeEventListener('mouseleave', this.handleTooltipMouseLeave);
    
    console.log(`${MODULE_ID} | Event handlers cleaned up`);
  }
}