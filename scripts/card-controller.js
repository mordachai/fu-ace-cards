// scripts/card-controller.js
import { MODULE_ID } from './settings.js';
import { UIManager } from './ui-manager.js';
import { SocketManager } from './socket-manager.js';
import { PileManager } from './pile-manager.js';
import { getTablePile, getCurrentPlayerPiles, getPlayerPiles } from './pile-manager.js';
import { DeckManager } from './deck-manager.js';
import { SET_NAMES } from './set-detector.js';
import { getCardValue } from './set-detector.js';
import { DamageIntegration } from './damage-integration.js';

export class CardController {
  
// Draw a card from deck to hand
static async drawCard() {
  const piles = PileManager.getCurrentPlayerPiles();
  
  // Check if deck exists
  if (!piles?.deck) {
    console.error(`${MODULE_ID} | Cannot draw: No deck assigned`);
    return false;
  }

  // Let's first check how many AVAILABLE cards we have (with drawn=false)
  const availableCards = Array.from(piles.deck.cards).filter(c => !c.drawn);
  console.log(`${MODULE_ID} | Deck has ${piles.deck.cards.size} total cards, ${availableCards.length} available for drawing`);
  
  // If no available cards, we need to reshuffle from discard
  if (availableCards.length === 0) {
    // Check if discard has cards to reshuffle
    if (piles.discard && piles.discard.cards.size > 0) {
      const discardSize = piles.discard.cards.size;
      // Keep this notification - it's the auto-reshuffling we want to notify about
      ui.notifications.info(`Deck empty! Reshuffling ${discardSize} cards from discard pile into deck...`);
      
      try {
        // The safest approach is to use the built-in pile functions
        // This moves all cards from discard to deck and shuffles
        await piles.discard.pass(piles.deck, Array.from(piles.discard.cards).map(c => c.id), {
          chatNotification: false
        });
        
        // After moving the cards, we need to reset their drawn status
        // We have to use the foundry method to update cards properly
        const deckCards = Array.from(piles.deck.cards);
        if (deckCards.length > 0) {
          const updates = deckCards.map(card => ({
            _id: card.id,
            drawn: false  // Set all cards as available
          }));
          
          // Apply updates as a single operation
          await piles.deck.updateEmbeddedDocuments("Card", updates);
          
          // Shuffle the deck
          await piles.deck.shuffle();
          
          console.log(`${MODULE_ID} | Reshuffled ${updates.length} cards from discard into deck`);
        }
        
        // Try drawing again after reshuffling
        return this.drawCard();
      } catch (error) {
        console.error(`${MODULE_ID} | Error reshuffling:`, error);
        return false;
      }
    } else {
      console.log(`${MODULE_ID} | Cannot draw: Deck empty and no cards in discard`);
      return false;
    }
  }

  // If we reach here, we have available cards to draw
  try {
    // Draw one card to hand
    await piles.deck.deal([piles.hand], 1, { 
      how: CONST.CARD_DRAW_MODES.RANDOM, 
      chatNotification: false 
    });
    
    // Update UI
    UIManager.renderHand();
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Error drawing card:`, error);
    return false;
  }
}

// Discard a specific card from hand
static async discardCard(cardId) {
  const piles = getCurrentPlayerPiles();
  if (!piles?.hand || !piles?.discard) {
    return false;
  }
  
  // Check if the card is still in the hand
  if (!piles.hand.cards.has(cardId)) {
    return false;
  }
  
  try {
    // Clean up tooltips before moving cards
    UIManager.cleanupAllTooltips();
    
    // Pass the card to the discard pile
    await piles.hand.pass(piles.discard, [cardId], { chatNotification: false });
    
    // Update UI
    UIManager.renderHand();
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Error discarding card:`, error);
    return false;
  }
}

// Play a card from hand to table
static async playCardToTable(card) {
  const piles = getCurrentPlayerPiles();
  const tablePile = getTablePile();
  
  if (!piles?.hand || !tablePile) {
    return false;
  }
  
  try {
    await piles.hand.pass(tablePile, [card.id], { chatNotification: false });
    
    // Set owner flag on the card AFTER successful pass
    const tableCard = tablePile.cards.get(card.id);
    if (tableCard) {
      await tableCard.setFlag(MODULE_ID, 'ownerId', game.userId);
      
      // If it's a joker, also transfer phantom values
      if (card.name.toLowerCase().includes('joker') || card.getFlag(MODULE_ID, 'isJoker')) {
        const phantomSuit = card.getFlag(MODULE_ID, 'phantomSuit');
        const phantomValue = card.getFlag(MODULE_ID, 'phantomValue');
        
        if (phantomSuit) await tableCard.setFlag(MODULE_ID, 'phantomSuit', phantomSuit);
        if (phantomValue) await tableCard.setFlag(MODULE_ID, 'phantomValue', phantomValue);
      }
    }
    
    // Emit socket message to notify other players
    SocketManager.emitCardToTable(card.id);
    
    UIManager.renderHand();
    UIManager.renderTable();
    return true;
  } catch (error) {
    console.error("Error playing card:", error);
    UIManager.renderHand(); // Re-render to ensure UI is in sync
    return false;
  }
}
  
// Play a set to table
static async playSetToTable(setData, indicator) {
  const piles = getCurrentPlayerPiles();
  const tablePile = getTablePile();
  
  if (!piles?.hand || !tablePile) {
    return false;
  }
  
  // Hide tooltip immediately when clicking
  UIManager.cleanupAllTooltips();

  // Get card IDs from the indicator
  const cardIds = indicator.dataset.cardIds.split(',');
  if (!cardIds || cardIds.length === 0) {
    return false;
  }

  // Check if set contains unassigned jokers
  const hasUnassignedJoker = cardIds.some(cardId => {
    const card = piles.hand.cards.get(cardId);
    if (!card) return false;
    
    const isJoker = card.name.toLowerCase().includes('joker') || card.getFlag(MODULE_ID, 'isJoker');
    return isJoker && (!card.getFlag(MODULE_ID, 'phantomSuit') || !card.getFlag(MODULE_ID, 'phantomValue'));
  });
  
  if (hasUnassignedJoker) {
    return false;
  }
  
  // Double-check we can still afford it
  const mpCost = parseInt(indicator.dataset.mpCost);
  const actor = game.user.character;
  
  if (actor) {
    const currentMP = actor.system.resources?.mp?.value || 0;
    if (currentMP < mpCost) {
      // Keep this notification - it's one of the ones we want
      ui.notifications.warn(`Not enough MP to play set. Need ${mpCost} MP, have ${currentMP} MP.`);
      return false;
    }
  }
  
  const setType = indicator.dataset.setType;
  
  try {
    // Play all cards in the set to table
    for (const cardId of cardIds) {
      if (!piles.hand.cards.has(cardId)) {
        throw new Error(`Card ${cardId} no longer in hand`);
      }
      
      // Get card before passing to preserve any flags
      const handCard = piles.hand.cards.get(cardId);
      
      // Pass the card to the table
      await piles.hand.pass(tablePile, [cardId], { chatNotification: false });
      
      // Set owner flag on the card AFTER successful pass
      const tableCard = tablePile.cards.get(cardId);
      if (tableCard) {
        // Set basic flags
        await tableCard.setFlag(MODULE_ID, 'ownerId', game.userId);
        await tableCard.setFlag(MODULE_ID, 'setType', setType);
        
        // If it's a joker, also transfer the phantom values
        if (handCard.name.toLowerCase().includes('joker') || handCard.getFlag(MODULE_ID, 'isJoker')) {
          const phantomSuit = handCard.getFlag(MODULE_ID, 'phantomSuit');
          const phantomValue = handCard.getFlag(MODULE_ID, 'phantomValue');
          
          if (phantomSuit) await tableCard.setFlag(MODULE_ID, 'phantomSuit', phantomSuit);
          if (phantomValue) await tableCard.setFlag(MODULE_ID, 'phantomValue', phantomValue);
        }
      }
    }
    
    // Emit socket message to notify other players
    SocketManager.emitSetPlayed(setType, cardIds);
    
    // Update UI
    UIManager.renderHand();
    UIManager.renderTable();
    
    // Show notification
    const setName = SET_NAMES[setType] || setType.replace('-', ' ').split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    return true;
    
  } catch (error) {
    console.error("Error playing set:", error);
    UIManager.renderHand();
    return false;
  }
}
  
// Clean the table
static async cleanTable() {
  const tablePile = getTablePile();
  if (!tablePile) {
    console.error(`${MODULE_ID} | Table pile not available`);
    return false;
  }
  
  const cards = Array.from(tablePile.cards);
  if (cards.length === 0) {
    console.log(`${MODULE_ID} | Table is already empty`);
    return false;
  }
  
  // Group cards by their owner
  const cardsByOwner = {};
  
  for (const card of cards) {
    const ownerId = card.getFlag(MODULE_ID, 'ownerId');
    if (!ownerId) {
      console.warn(`${MODULE_ID} | Card ${card.name} has no owner, will remain on table`);
      continue;
    }
    
    if (!cardsByOwner[ownerId]) cardsByOwner[ownerId] = [];
    cardsByOwner[ownerId].push(card.id);
  }
  
  // Process cards for each owner
  for (const [ownerId, cardIds] of Object.entries(cardsByOwner)) {
    try {
      // Get owner's discard pile
      const ownerPiles = getPlayerPiles(ownerId);
      
      if (!ownerPiles?.discard) {
        console.warn(`${MODULE_ID} | No discard pile found for ${game.users.get(ownerId)?.name}`);
        continue;
      }
      
      // Pass the cards to the owner's discard pile
      await tablePile.pass(ownerPiles.discard, cardIds, { chatNotification: false });
      console.log(`${MODULE_ID} | Moved ${cardIds.length} cards to ${game.users.get(ownerId)?.name}'s discard pile`);
    } catch (error) {
      console.error(`${MODULE_ID} | Error handling cards for player ${ownerId}:`, error);
    }
  }
  
  // Clean up tooltips and update UI
  UIManager.cleanupAllTooltips();
  UIManager.renderTable();
  SocketManager.emitCleanTable();
  
  console.log(`${MODULE_ID} | Table cleaned successfully`);
  return true;
}
  
// Reset hand
static async resetHand() {
  const piles = getCurrentPlayerPiles();
  if (!piles?.hand) {
    return false;
  }
  
  const ids = piles.hand.cards.map(c => c.id);
  if (!ids.length) {
    return false;
  }
  
  await piles.hand.pass(piles.discard, ids, { chatNotification: false });
  
  // Clean up tooltips when hand is reset
  UIManager.cleanupAllTooltips();
  
  UIManager.renderHand();
  return true;
}
  
  // Activate a set on the table
static async activateTableSet(setData, playerId) {
  // Only the owner can activate their sets
  if (playerId !== game.userId) {
    return false;
  }
  
  const mpCost = setData.cards.length * 5;
  
  // Create chat message with card images
  const player = game.users.get(playerId);
  const character = player.character;
  
  const chatData = {
    user: game.userId,
    speaker: ChatMessage.getSpeaker({ actor: character }),
    content: await this.createSetActivationMessage(setData, playerId, mpCost),
    type: CONST.CHAT_MESSAGE_TYPES.OTHER
  };
  
  await ChatMessage.create(chatData);
  
  try {
    // Get the player's discard pile
    // For class-based DeckManager:
    const piles = getPlayerPiles(playerId);
    // OR for function-based:
    // const piles = getPlayerPiles(playerId);
    
    if (!piles?.discard) {
      ui.notifications.error("Could not find your discard pile");
      return false;
    }
    
    const tablePile = getTablePile();
    if (!tablePile) {
      ui.notifications.error("Table pile not found");
      return false;
    }
    
    // Move the set cards from table to discard
    await tablePile.pass(piles.discard, setData.cardIds, { chatNotification: false });
    
    // Emit socket message and update UI
    SocketManager.emitSetActivated(setData.type, setData.cardIds);
    UIManager.renderTable();
    
    return true;
  } catch (error) {
    console.error("Error activating set:", error);
    ui.notifications.error(`Failed to discard set cards: ${error.message}`);
    return false;
  }
}


static async createSetActivationMessage(setData, playerId, mpCost) {
  // Get description data
  const description = this.getSetEffectDescription(setData);
  const player = game.users.get(playerId);
  const character = player.character;
  const characterName = character?.name;
  const displayName = characterName || player.name;
  const actorId = character?.id || "";
  
  // Calculate damage if this set type deals damage
  const damageData = DamageIntegration.calculateDamageForSet(setData);

  // Add flag for sets that need damage type selection
  const isDoubleTrouble = setData.type === 'double-trouble';
  
  // Determine if this set targets multiple enemies or is single-target
  const isMultiTarget = ['jackpot', 'magic-flush', 'blinding-flush', 'full-status', 'triple-support', 'forbidden-monarch'].includes(setData.type);
  
  // Get suit information for each card
  const cardsWithSuits = setData.cards.map(card => ({
      id: card.id,
      name: card.name,
      img: card.faces[card.face ?? 0]?.img,
      suit: this.getCardSuit(card) // Extract the suit properly
  }));

  // Get available damage types (suits) for this set
  const availableSuits = [...new Set(cardsWithSuits.map(c => c.suit))];
  
  // Get highest value for effects that need it
  const highestValue = Math.max(...setData.values);
  
  // Prepare data for template
  const templateData = {
    debugInfo: game.user.isGM && game.settings.get(MODULE_ID, 'debug'), // Only if you have a debug setting
    highestValue: damageData?.highestValue || highestValue,
    isEven: (damageData?.highestValue || highestValue) % 2 === 0,
    setType: setData.type,
    setName: SET_NAMES[setData.type],
    playerName: displayName,
    actorId: actorId,
    mpCost: mpCost,
    effect: description.effect,
    comboDescription: description.base,
    isMultiTarget: isMultiTarget, // Added for targeting info
    isDoubleTrouble: isDoubleTrouble,
    cards: cardsWithSuits,
    availableSuits: availableSuits,
    hasDamage: damageData !== null,
    damageValue: damageData?.value || 0,
    damageType: damageData?.type || '',
    damageTypeLabel: damageData?.type ? game.i18n.localize(`FU.Damage${window.capitalize(damageData.type)}`) || damageData.type.toUpperCase() : '',
    highRoll: damageData?.highRoll || 0,
    baseDamage: damageData?.baseDamage || 0
  };
  
  // Render the template
  return await renderTemplate(`modules/${MODULE_ID}/templates/set-activation.hbs`, templateData);
}

// Helper method to get card suit
static getCardSuit(card) {
  // Try to get suit from card data, flags, or name
  return card.suit || card.getFlag(MODULE_ID, 'suit') || 
         card.name.toLowerCase().match(/(clubs?|diamonds?|hearts?|spades?)/)?.[0] || '';
}

// Helper method to get set description
static getSetEffectDescription(setData) {
  // This is imported from elsewhere in your code, let's implement it directly
  const SET_DESCRIPTIONS = {
    'jackpot': {
      base: '4 cards of the same value, none of which is a joker',
      effect: 'You and every ally present on the scene recover 777 Hit Points and 777 Mind Points; any PCs who have surrendered but are still part of the scene immediately regain consciousness (this does not cancel the effects of their Surrender).'
    },
    'magic-flush': {
      base: '4 cards of consecutive values and of the same suit',
      effect: 'You deal damage equal to 【25 + the total value of the resolved cards】 to each enemy present on the scene; the type of this damage matches the suit of the resolved cards.'
    },
    'blinding-flush': {
      base: '4 cards of consecutive values',
      effect: 'You deal damage equal to 【15 + the total value of the resolved cards】 to each enemy present on the scene; the type of this damage is light if the highest value among those cards is even, or dark if that value is odd.'
    },
    'full-status': {
      base: '3 cards of the same value + 2 cards of the same value',
      effect: 'Choose two status effects among dazed, shaken, slow, and weak: if 【the highest value among resolved cards】 is even, you and every ally present on the scene recover from the chosen status effects; if odd, each enemy present on the scene suffers them.'
    },
    'triple-support': {
      base: '3 cards of the same value',
      effect: 'You and every ally present on the scene regain an amount of Hit Points and Mind Points equal to 【the total value of the resolved cards, multiplied by 3】.'
    },
    'double-trouble': {
      base: '2 cards of the same value + 2 cards of the same value',
      effect: 'You deal damage equal to 【10 + the highest value among resolved cards】 to each of up to two different enemies you can see that are present on the scene; the type of this damage is one of your choice among those matching the suits of the resolved cards.'
    },
    'magic-pair': {
      base: '2 cards of the same value',
      effect: 'You perform a free attack with a weapon you have equipped. If this attack deals damage, choose a suit among those of the resolved cards; all damage dealt by the attack becomes of the type matching that suit.'
    },
    'forbidden-monarch': {
      base: '4 cards of the same value, none of which is a joker + 1 joker',
      effect: 'You deal damage 777 damage to each enemy present on the scene; the type of this damage is light if 【the common value of the 4 cards】 is even, or dark if that total is odd. If there is a joker in your discard pile, the damage dealt by this effect ignores Immunities and Resistances.'
    }
  };

  const template = SET_DESCRIPTIONS[setData.type] || { base: 'Unknown set', effect: 'Unknown effect' };
  
  // Calculate specific values for this set
  let effect = template.effect;
  const totalValue = setData.values.reduce((sum, val) => sum + val, 0);
  const highestValue = Math.max(...setData.values);
  
  // Replace placeholders with calculated values based on set type
  switch (setData.type) {
    case 'magic-flush': {
      const magicDamage = 25 + totalValue;
      effect = effect.replace('【25 + the total value of the resolved cards】', `【${magicDamage}】`);
      break;
    }
    case 'blinding-flush': {
      const blindingDamage = 15 + totalValue;
      const damageType = highestValue % 2 === 0 ? 'light' : 'dark';
      effect = effect.replace('【15 + the total value of the resolved cards】', `【${blindingDamage}】`);
      effect = effect.replace('light if the highest value among those cards is even, or dark if that value is odd', 
                              `${damageType} (highest value: ${highestValue})`);
      break;
    }
    case 'full-status': {
      effect = effect.replace('【the highest value among resolved cards】', `【${highestValue}】`);
      const statusEffect = highestValue % 2 === 0 ? 'recover from' : 'suffer';
      effect = effect.replace('if even, you and every ally present on the scene recover from the chosen status effects; if odd, each enemy present on the scene suffers them',
                            `allies will ${statusEffect} the chosen status effects`);
      break;
    }
    case 'triple-support': {
      const healAmount = totalValue * 3;
      effect = effect.replace('【the total value of the resolved cards, multiplied by 3】', `【${healAmount}】`);
      break;
    }
    case 'double-trouble': {
      const doubleDamage = 10 + highestValue;
      effect = effect.replace('【10 + the highest value among resolved cards】', `【${doubleDamage}】`);
      break;
    }
    case 'forbidden-monarch': {
      const commonValue = setData.values[0]; // First value in a set with same values
      const forbiddenType = commonValue % 2 === 0 ? 'light' : 'dark';
      effect = effect.replace('【the common value of the 4 cards】', `【${commonValue}】`);
      effect = effect.replace('light if 【the common value of the 4 cards】 is even, or dark if that total is odd',
                            `${forbiddenType} damage`);
      break;
    }
  }
  
  return {
    base: template.base,
    effect: effect,
    cards: setData.cards.map(c => c.name).join(', ')
  };
}

}