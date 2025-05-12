// scripts/main.js
import { DeckManager } from './deck-manager.js';
import { MODULE_ID, registerSettings } from './settings.js';
import { 
  clearHighlights,
  getSetEffectDescription,
  getPlayerColor, 
  applyPlayerColor, 
  createCardTooltip, 
  updateSetInfoBar, 
  highlightValidSets,
  createSetTooltip,
  showSetTooltip,
  hideSetTooltip
} from './ui-enhancements.js';
import { getCardValue, SET_NAMES } from './set-detector.js';

// Player deck tracking
let playerDecks = {};
let tablePile = null;
let activeTooltips = new Set();

// Export function to get current player's piles
export function getCurrentPlayerPiles() {
  return playerDecks[game.userId];
}

// Export function to get any player's piles by ID
export function getPlayerPiles(userId) {
  return playerDecks[userId];
}

// Export function to get table pile
export function getTablePile() {
  return tablePile;
}

// Clean up all tooltips
function cleanupAllTooltips() {
  // Remove any active tooltips
  activeTooltips.forEach(tooltip => {
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
  });
  activeTooltips.clear();
  
  // Also remove any tooltips with class fu-set-tooltip
  document.querySelectorAll('.fu-set-tooltip').forEach(tooltip => tooltip.remove());
  
  // And remove the tooltip with ID fu-set-tooltip if it exists
  const tooltipElement = document.getElementById('fu-set-tooltip');
  if (tooltipElement) tooltipElement.remove();
  
  // Clear card highlights
  clearHighlights();
}

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing module`);
  DeckManager.init();
  registerSettings();
  
  // Register Handlebars helper for equality check
  Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });
  
  // Add capitalize helper for string formatting
  String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
  };
});

Hooks.once('ready', async () => {
  const user = game.user;
  
  // Find the shared table pile
  tablePile = game.cards.getName('Table');
  if (!tablePile) {
    if (user.isGM) {
      tablePile = await Cards.create({
        name: 'Table',
        type: 'pile',
        permission: { default: 2 }
      });
      ui.notifications.info('Created shared table pile');
    } else {
      ui.notifications.error('Table pile not found. Please ask GM to create it.');
      return;
    }
  }

  // Get player-specific piles
  const userId = user.id;
  let piles = null;
  
  try {
    playerDecks[userId] = await DeckManager.findOrCreatePlayerPiles(userId);
    piles = playerDecks[userId];
  } catch (error) {
    console.log(`${MODULE_ID} | No decks assigned for ${user.name}`);
  }
  
  // Only reset deck if user has their own deck assigned and it's empty
  if (piles?.deck?.cards.size === 0) {
    await piles.discard.reset({ shuffle: true });
    ui.notifications.info('♻️ Deck reset & shuffled');
  }

  // Render UI areas
  let html;
  try {
    html = await renderTemplate(
      `modules/${MODULE_ID}/templates/areas.hbs`,
      {
        isGM: user.isGM,
        hasHandCards: !!piles?.hand
      }
    );
  } catch (error) {
    ui.notifications.error(`${MODULE_ID} | Template not found: ${error.message}`);
    return;
  }
  
  document.body.insertAdjacentHTML('beforeend', html);

  // Cache element references
  const tableCards = document.getElementById('fu-table-cards');
  const handCards  = document.getElementById('fu-hand-cards');
  const btnClean   = document.getElementById('fu-clean-table');
  const btnDraw    = document.getElementById('fu-draw-card');
  const btnReset   = document.getElementById('fu-reset-hand');
  const handArea   = document.getElementById('fu-hand-area');

  // Track timeout for cleanup
  let drawerTimeout;
  
  // Setup drawer behavior (hand area)
  if (handArea) {
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

  // Button handler: Clean Table
  const cleanTable = async () => {
    const ids = tablePile.cards.map(c => c.id);
    if (!ids.length) return ui.notifications.info('Table empty');
    
    // Group cards by their owner
    const cardsByOwner = {};
    for (const card of tablePile.cards) {
      const ownerId = card.getFlag(MODULE_ID, 'ownerId');
      if (!ownerId) {
        ui.notifications.warn(`Card ${card.name} has no owner`);
        continue;
      }
      if (!cardsByOwner[ownerId]) cardsByOwner[ownerId] = [];
      cardsByOwner[ownerId].push(card.id);
    }
    
    // Pass cards to their owner's discard pile
    for (const [ownerId, cardIds] of Object.entries(cardsByOwner)) {
      // Get the owner's deck assignments
      const ownerDeckData = DeckManager.getPlayerDecks(ownerId);
      if (!ownerDeckData?.discardId) {
        ui.notifications.warn(`No discard pile assigned for ${game.users.get(ownerId)?.name}`);
        continue;
      }
      
      // Find the discard pile
      const discardPile = game.cards.get(ownerDeckData.discardId);
      if (!discardPile) {
        ui.notifications.warn(`Discard pile not found for ${game.users.get(ownerId)?.name}`);
        continue;
      }
      
      // Pass the cards to the owner's discard pile
      await tablePile.pass(discardPile, cardIds, { chatNotification: false });
    }
    
    // Clean up tooltips when table is cleared
    cleanupAllTooltips();
    
    // Update the UI
    renderTable();
    
    // Emit socket message to notify other players
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'cleanTable',
      senderId: game.userId
    });
    
    ui.notifications.info('Table cleared');
  };

  // Button handler: Draw Card
  const drawCard = async () => {
    if (!piles?.deck) return ui.notifications.warn('No deck assigned');
    if (piles.deck.cards.size === 0) return ui.notifications.warn('Deck empty');
    
    await piles.deck.deal([piles.hand], 1, { how: CONST.CARD_DRAW_MODES.RANDOM, chatNotification: false });
    renderHand();
    ui.notifications.info('You drew a card');
  };

  // Button handler: Reset Hand
  const resetHand = async () => {
    if (!piles?.hand) return ui.notifications.warn('No hand assigned');
    const ids = piles.hand.cards.map(c => c.id);
    if (!ids.length) return ui.notifications.info('Hand empty');
    
    await piles.hand.pass(piles.discard, ids, { chatNotification: false });
    
    // Clean up tooltips when hand is reset
    cleanupAllTooltips();
    
    renderHand();
    ui.notifications.info('Hand reset');
  };

  // Add event listeners to buttons
  btnClean?.addEventListener('click', cleanTable);
  btnDraw?.addEventListener('click', drawCard);  
  btnReset?.addEventListener('click', resetHand);

  // Store cleanup functions
  if (btnClean) btnClean._cleanup = () => btnClean.removeEventListener('click', cleanTable);
  if (btnDraw) btnDraw._cleanup = () => btnDraw.removeEventListener('click', drawCard);
  if (btnReset) btnReset._cleanup = () => btnReset.removeEventListener('click', resetHand);

  // Handle playing a set from hand to table
  async function playSetToTable(setData, indicator) {
    if (!piles?.hand) return;
    
    // Hide tooltip immediately when clicking
    hideSetTooltip(indicator);
    cleanupAllTooltips();
    
    // Double-check we can still afford it
    const mpCost = parseInt(indicator.dataset.mpCost);
    const actor = game.user.character;
    
    if (actor) {
      const currentMP = actor.system.resources?.mp?.value || 0;
      if (currentMP < mpCost) {
        ui.notifications.warn(`Not enough MP. Need ${mpCost}, have ${currentMP}`);
        return;
      }
    }
    
    const cardIds = indicator.dataset.cardIds.split(',');
    const setType = indicator.dataset.setType;
    
    try {
      // Play all cards in the set to table
      for (const cardId of cardIds) {
        if (!piles.hand.cards.has(cardId)) {
          throw new Error(`Card ${cardId} no longer in hand`);
        }
        
        await piles.hand.pass(tablePile, [cardId], { chatNotification: false });
        
        // Set owner flag on the card AFTER successful pass
        const tableCard = tablePile.cards.get(cardId);
        if (tableCard) {
          await tableCard.setFlag(MODULE_ID, 'ownerId', game.userId);
          await tableCard.setFlag(MODULE_ID, 'setType', setType);
        }
      }
      
      // Emit socket message to notify other players
      game.socket.emit(`module.${MODULE_ID}`, {
        action: 'setPlayed',
        setType: setType,
        cardIds: cardIds,
        playerId: game.userId
      });
      
      renderHand();
      renderTable();
      ui.notifications.info(`Played ${SET_NAMES[setType]} to table (${mpCost} MP)`);
      
    } catch (error) {
      ui.notifications.error(`Failed to play set: ${error.message}`);
      renderHand();
    }
  }

  // Handle clicking a set on the table - shows in chat and discards the cards
  async function activateTableSet(setData, playerId) {
    // Only the owner can activate their sets
    if (playerId !== game.userId) {
      ui.notifications.warn("You can only activate your own sets");
      return;
    }
    
    const mpCost = setData.cards.length * 5;
    
    // Create chat message with card images
    const player = game.users.get(playerId);
    const character = player.character;
    
    const chatData = {
      user: game.userId,
      speaker: ChatMessage.getSpeaker({ actor: character }),
      content: await createSetActivationMessage(setData, playerId, mpCost),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    };
    
    await ChatMessage.create(chatData);
    
    // Get the player's discard pile
    const deckData = DeckManager.getPlayerDecks(playerId);
    if (!deckData?.discardId) {
      ui.notifications.error("Could not find your discard pile");
      return;
    }
    
    const discardPile = game.cards.get(deckData.discardId);
    if (!discardPile) {
      ui.notifications.error("Discard pile not found");
      return;
    }
    
    // Move the set cards from table to discard
    try {
      await tablePile.pass(discardPile, setData.cardIds, { chatNotification: false });
      
      // Emit socket message to notify other players
      game.socket.emit(`module.${MODULE_ID}`, {
        action: 'setActivated',
        setType: setData.type,
        cardIds: setData.cardIds,
        playerId: game.userId
      });
      
      // Refresh displays
      renderTable();
      ui.notifications.info(`Set activated and cards discarded`);
      
      // Future: Actually deduct MP and apply effects
      // await deductMP(mpCost);
      // await applySetEffects(setData);
    } catch (error) {
      ui.notifications.error(`Failed to discard set cards: ${error.message}`);
    }
  }

  // Create chat message for set activation - using template
  async function createSetActivationMessage(setData, playerId, mpCost) {
    const description = getSetEffectDescription(setData);
    const player = game.users.get(playerId);
    const character = player.character;
    const characterName = character?.name;
    const displayName = characterName || player.name;
    const actorId = character?.id || "";
    
    // Calculate damage if this set type deals damage
    const damageData = calculateDamageForSet(setData);
    
    // Prepare data for template
    const templateData = {
      setType: setData.type,
      setName: SET_NAMES[setData.type],
      playerName: displayName,
      actorId: actorId,
      mpCost: mpCost,
      effect: description.effect,
      comboDescription: description.base,
      cards: setData.cards.map(card => ({
        id: card.id,
        name: card.name,
        img: card.faces[card.face ?? 0]?.img
      })),
      hasDamage: damageData !== null,
      damageValue: damageData?.value || 0,
      damageType: damageData?.type || '',
      damageTypeLabel: damageData?.type ? game.i18n.localize(`FU.Damage${damageData.type.capitalize()}`) : '',
      highRoll: damageData?.highRoll || 0,
      baseDamage: damageData?.baseDamage || 0
    };
    
    // Render the template
    return await renderTemplate(`modules/${MODULE_ID}/templates/set-activation.hbs`, templateData);
  }
  
  // Calculate damage value and type for a given set
  function calculateDamageForSet(setData) {
    if (!setData || !setData.values || !setData.cards) return null;
    
    // Get total value of all cards
    const totalValue = setData.values.reduce((sum, val) => sum + val, 0);
    const highestValue = Math.max(...setData.values);
    
    // Map suits to damage types
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
    
    switch (setData.type) {
      case 'magic-flush': {
        // 4 cards of consecutive values and of the same suit
        // Damage: 25 + total value of cards, type matches the suit
        const firstCard = setData.cards[0];
        const suit = getCardSuit(firstCard);
        const damageType = suitToDamageType[suit.toLowerCase()] || 'physical';
        
        return {
          value: 25 + totalValue,
          type: damageType,
          highRoll: totalValue,
          baseDamage: 25
        };
      }
      case 'blinding-flush': {
        // 4 cards of consecutive values
        // Damage: 15 + total value, light if highest is even, dark if odd
        const damageType = highestValue % 2 === 0 ? 'light' : 'dark';
        
        return {
          value: 15 + totalValue,
          type: damageType,
          highRoll: totalValue,
          baseDamage: 15
        };
      }
      case 'double-trouble': {
        // 2 cards of same value + 2 cards of same value
        // Damage: 10 + highest value among cards
        const firstCard = setData.cards[0];
        const suit = getCardSuit(firstCard);
        const damageType = suitToDamageType[suit.toLowerCase()] || 'physical';
        
        return {
          value: 10 + highestValue,
          type: damageType,
          highRoll: highestValue,
          baseDamage: 10
        };
      }
      case 'forbidden-monarch': {
        // 4 cards of same value + 1 joker
        // Damage: 777, light if common value is even, dark if odd
        const commonValue = setData.value || setData.values[0];
        const damageType = commonValue % 2 === 0 ? 'light' : 'dark';
        
        return {
          value: 777,
          type: damageType,
          highRoll: 0,
          baseDamage: 777
        };
      }
      default:
        return null;
    }
  }
  
  // Get card suit from card data
  function getCardSuit(card) {
    // Try to get suit from card data, flags, or name
    return card.suit || card.getFlag('fu-ace-cards', 'suit') || 
           card.name.toLowerCase().match(/(clubs?|diamonds?|hearts?|spades?)/)?.[0] || '';
  }

  // Render the table area
  function renderTable() {
    const tableArea = document.getElementById('fu-table-area');
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
      applyPlayerColor(d, c);
      
      // Add tooltip
      const tooltip = createCardTooltip(c);
      if (tooltip) {
        d.dataset.tooltip = tooltip;
      }
      
      container.appendChild(d);
    }
    
    // Update set info bar for table
    if (cards.size > 0) {
      updateSetInfoBar(Array.from(cards), 'table', handleTableSetClick);
    }
  }

  // Render the hand area
  function renderHand() {
    // Bail out if the hand area isn't in the DOM
    const handCards = document.getElementById('fu-hand-cards');
    if (!handCards) return;

    handCards.innerHTML = '';
    
    // Check if player has piles assigned
    if (!piles?.hand) return;
    
    const hand = piles.hand;
    if (!hand) return;

    for (const c of hand.cards) {
      const d = document.createElement('div');
      d.className = 'fu-card';
      d.style.backgroundImage = `url(${c.faces[c.face ?? 0]?.img})`;
      d.dataset.cardId = c.id;
      
      // Add tooltip for hand cards
      d.dataset.tooltip = c.name;
      
      // Play a single card from hand to table
      d.addEventListener('click', async () => {
        // Validate the card is still in hand before attempting to pass
        if (!hand.cards.has(c.id)) {
          ui.notifications.warn('Card no longer in hand');
          renderHand();
          return;
        }
        
        // Clean up tooltips before moving cards
        cleanupAllTooltips();
        
        try {
          await hand.pass(tablePile, [c.id], { chatNotification: false });
          
          // Set owner flag on the card AFTER successful pass
          const tableCard = tablePile.cards.get(c.id);
          if (tableCard) {
            await tableCard.setFlag(MODULE_ID, 'ownerId', game.userId);
          }
          
          // Only emit socket if pass was successful
          game.socket.emit(`module.${MODULE_ID}`, {
            action: 'cardToTable',
            cardId: c.id,
            senderId: game.userId
          });
          renderHand(); 
          renderTable();
          ui.notifications.info(`Played ${c.name}`);
        } catch (error) {
          ui.notifications.error(`Failed to play card: ${error.message}`);
          renderHand(); // Re-render to ensure UI is in sync
        }
      });
      handCards.appendChild(d);
    }
    
    // Update set info bar for hand with click handler
    if (hand.cards.size > 0) {
      updateSetInfoBar(Array.from(hand.cards), 'hand', handleHandSetClick);
    }
  }

  // Handle clicking a set indicator in hand
  function handleHandSetClick(indicator) {
    // Only handle clicks on available sets
    if (!indicator.classList.contains('available')) {
      return;
    }
    
    const setType = indicator.dataset.setType;
    const cardIds = indicator.dataset.cardIds.split(',');
    
    // Create set data
    const setData = {
      type: setType,
      name: SET_NAMES[setType],
      cardIds: cardIds
    };
    
    playSetToTable(setData, indicator);
  }

  // Handle clicking a set indicator on table
  function handleTableSetClick(indicator) {
    // Only handle clicks on own sets
    if (!indicator.classList.contains('own-set')) {
      return;
    }
    
    const setType = indicator.dataset.setType;
    const cardIds = indicator.dataset.cardIds.split(',');
    const playerId = indicator.dataset.playerId;
    
    // Clean up tooltips before activation
    cleanupAllTooltips();
    
    // Get the actual cards
    const cards = cardIds.map(id => tablePile.cards.get(id)).filter(Boolean);
    
    // Create set data
    const setData = {
      type: setType,
      name: SET_NAMES[setType],
      cards: cards,
      cardIds: cardIds,
      values: cards.map(c => getCardValue(c))
    };
    
    activateTableSet(setData, playerId);
  }

  // Set up event listeners for tooltips
  document.addEventListener('mouseenter', (e) => {
    const indicator = e.target.closest('.fu-set-indicator');
    if (indicator) {
      const containerType = indicator.closest('#fu-hand-area') ? 'hand' : 'table';
      
      if (containerType === 'hand') {
        // Show tooltip for hand sets
        const tooltip = showSetTooltip(indicator, containerType);
        if (tooltip) {
          activeTooltips.add(tooltip);
        }
      } else {
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
  }, true);

  document.addEventListener('mouseleave', (e) => {
    const indicator = e.target.closest('.fu-set-indicator');
    if (indicator) {
      hideSetTooltip(indicator);
      
      // Also clear highlights for table sets
      if (indicator.closest('#fu-table-area')) {
        clearHighlights();
      }
    }
  }, true);

  // Handle global events that should clean up tooltips
  document.addEventListener('click', (e) => {
    // Don't clean up if clicking on a set indicator or a card
    if (e.target.closest('.fu-set-indicator') || e.target.closest('.fu-card')) {
      return;
    }
    
    // Otherwise clean up tooltips
    cleanupAllTooltips();
  });

  // Handle the MP spending and damage application buttons in chat messages
  Hooks.on('renderChatMessage', (message, html) => {
    // Handle MP spending button
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
    
    // Handle damage application button
    html.find('[data-action="applyDamageSelected"]').click(async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const damageType = button.dataset.damageType;
      const damageValue = parseInt(button.dataset.damageValue);
      const setType = button.dataset.setType;
      
      // Get targeted tokens (for enemies) instead of selected tokens
      const targetedTokens = Array.from(game.user.targets);
      if (targetedTokens.length === 0) {
        ui.notifications.warn("No targets selected. Use the targeting tool to target enemies.");
        return;
      }
      
      // Determine if ignoring resistances/immunities based on ctrl/shift keys
      const ignoreResistances = event.shiftKey;
      const ignoreImmunities = event.ctrlKey && event.shiftKey;
      const openCustomizer = event.ctrlKey && !event.shiftKey;
      
      // Get traits based on the set type
      const traits = [];
      if (ignoreResistances) traits.push("ignore-resistances");
      if (ignoreImmunities) traits.push("ignore-immunities");
      
      // Add set-specific traits
      if (setType === 'forbidden-monarch') {
        traits.push("ignore-resistances");
        traits.push("ignore-immunities");
      }
      
      if (openCustomizer) {
        // Here you would open the damage customizer
        // This requires integrating with the system's damage customizer
        ui.notifications.info("Damage customization would open here");
        return;
      }
      
      // Apply damage to each targeted token
      for (const token of targetedTokens) {
        const actor = token.actor;
        if (!actor) continue;
        
        // Apply damage directly to the actor
        const currentHP = actor.system.resources.hp.value;
        const newHP = Math.max(0, currentHP - damageValue);
        
        await actor.update({
          "system.resources.hp.value": newHP
        });
        
        // Show the damage amount as floaty text
        const gridSize = canvas.grid.size;
        const text = `-${damageValue} ${damageType.toUpperCase()}`;
        canvas.interface?.createScrollingText(
          { x: token.center.x, y: token.center.y - gridSize/2 },
          text,
          { fill: "red", fontSize: 24, stroke: 0x000000, strokeThickness: 4 }
        );
      }
      
      // Disable the button after applying damage
      button.classList.add("disabled");
      $(button).find("span").text(`Damage Applied (${damageValue})`);
      
      ui.notifications.info(`Applied ${damageValue} ${damageType} damage to ${targetedTokens.length} target(s)`);
    });
  });

  // Hooks & socket
  Hooks.on('updateCards', (cards, change, options, userId) => {
    // Always clean up tooltips when cards change
    cleanupAllTooltips();
    
    // Refresh displays when card stacks change
    if (cards === tablePile || 
        Object.values(playerDecks).some(p => cards === p?.deck || cards === p?.hand || cards === p?.discard)) {
      renderTable();
      if (document.getElementById('fu-hand-cards')) renderHand();
    }
  });

  // Hook into actor updates to refresh when MP changes
  Hooks.on('updateActor', (actor, changes) => {
    // If MP changed and this is our character
    if (actor.id === game.user.character?.id && 
        changes.system?.resources?.mp) {
      // Re-render hand to update set availability
      renderHand();
    }
  });
  
  // Socket handler with validation
  game.socket.on(`module.${MODULE_ID}`, async msg => {
    if (msg.senderId === game.userId) return; // Ignore own messages
    
    // Clean up tooltips on all socket messages
    cleanupAllTooltips();
    
    switch (msg.action) {
      case 'cardToTable':
        // Validate that the card actually was moved to the table
        const tableCard = tablePile.cards.get(msg.cardId);
        if (tableCard) {
          renderTable();
        }
        break;
        
      case 'cleanTable':
        // Another player cleaned the table, update our view
        renderTable();
        break;
        
      case 'setPlayed':
        // Another player played a set
        renderTable();
        break;
        
      case 'setActivated':
        // Another player activated a set and discarded the cards
        renderTable();
        break;
    }
  });

  // Event listener for canvas and scene changes
  Hooks.on('canvasReady', () => {
    // Clean up tooltips when the scene changes
    cleanupAllTooltips();
  });

  // Cleanup function for module disable/re-enable
  Hooks.once('closeApplication', () => {
    // Clean up event listeners
    handArea?._cleanupDrawer?.();
    btnClean?._cleanup?.();
    btnDraw?._cleanup?.();
    btnReset?._cleanup?.();
    
    // Clean up all tooltips
    cleanupAllTooltips();
    
    // Remove socket listener
    game.socket.off(`module.${MODULE_ID}`);
  });

  // Initial render
  renderTable();
  renderHand();
  console.log(`${MODULE_ID} | Ready`);
});