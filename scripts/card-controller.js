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
import { HealingIntegration } from './healing-integration.js';

export class CardController {

// Draw a card from deck to hand
static async drawCard() {
  const piles = PileManager.getCurrentPlayerPiles();
  
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
    // Select a random card to draw instead of using deal
    const cardToDraw = availableCards[Math.floor(Math.random() * availableCards.length)];
    
    // Check if this card already exists in hand
    const existingInHand = Array.from(piles.hand.cards).find(c => c.id === cardToDraw.id);
    if (existingInHand) {
      console.error(`${MODULE_ID} | Card ${cardToDraw.id} already exists in hand!`);
      // Mark it as drawn in the deck to prevent future attempts
      await cardToDraw.update({drawn: true});
      // Try drawing again - different card
      return this.drawCard();
    }
    
    // Use pass instead of deal to move the specific card
    await piles.deck.pass(piles.hand, [cardToDraw.id], {
      chatNotification: false
    });
    
    // Update UI
    UIManager.renderHand();
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Error drawing card:`, error);
    // Log additional diagnostic info
    console.log(`${MODULE_ID} | Draw operation failed. Checking card locations...`);
    try {
      const cardStates = game.cards.contents.flatMap(pile => 
        Array.from(pile.cards).map(card => ({
          id: card.id,
          pile: pile.name,
          drawn: card.drawn
        }))
      );
      console.log(`${MODULE_ID} | Card states:`, cardStates);
    } catch (e) {
      console.error("Failed to log card diagnostics:", e);
    }
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
    
    // Send socket message to notify other players
    SocketManager.emitCardReturnedToHand(cardId);
    
    return true;
  } catch (error) {
    console.error("Error returning card to hand:", error);
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
  
  // Simple check - make sure card is in hand before proceeding
  if (!piles.hand.cards.has(card.id)) {
    ui.notifications.warn("Card not found in hand");
    return false;
  }
  
  try {
    // Before passing the card, try to find its original in deck and mark as drawn
    if (piles.deck) {
      const deckCards = Array.from(piles.deck.cards);
      // Find all cards with the same name as the one we're playing
      const sameNameCards = deckCards.filter(c => 
        c.name === card.name && 
        c.suit === card.suit && 
        c.value === card.value && 
        !c.drawn
      );
      
      if (sameNameCards.length > 0) {
        // Mark the first one as drawn
        await sameNameCards[0].update({drawn: true});
      }
    }

    // Now pass the card to the table
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
    
    // Verify handlers are still attached
    if (window.FuAceCards?.EventHandlers) {
      window.FuAceCards.EventHandlers.verifyHandDrawerHandlers();
    } else if (typeof EventHandlers !== 'undefined') {
      EventHandlers.verifyHandDrawerHandlers();
    }
    
    return true;
  } catch (error) {
    console.error("Error playing card:", error);
    UIManager.renderHand();
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

        // Verify handlers are still attached
    if (window.FuAceCards?.EventHandlers) {
      window.FuAceCards.EventHandlers.verifyHandDrawerHandlers();
    } else if (typeof EventHandlers !== 'undefined') {
      EventHandlers.verifyHandDrawerHandlers();
    }
    
    return true;
    
  } catch (error) {
    console.error("Error playing set:", error);
    UIManager.renderHand();
    return false;
  }
}

// Shuffle the deck - collect all cards and reset
static async shuffleDeck() {
  const piles = PileManager.getCurrentPlayerPiles();
  const tablePile = PileManager.getTablePile();
  
  if (!piles?.deck || !piles?.hand || !piles?.discard) {
    ui.notifications.error("Cannot shuffle: deck not configured correctly");
    return false;
  }
  
  try {
    // First, get our player's cards from the table
    const playerTableCards = [];
    if (tablePile) {
      const tableCards = Array.from(tablePile.cards);
      playerTableCards.push(...tableCards.filter(card => 
        card.getFlag(MODULE_ID, 'ownerId') === game.userId
      ));
    }
    
    // Diagnostic logging
    console.log(`${MODULE_ID} | Shuffling deck:`);
    console.log(`- Player has ${playerTableCards.length} cards on the table`);
    console.log(`- ${piles.hand.cards.size} cards in hand`);
    console.log(`- ${piles.discard.cards.size} cards in discard`);
    console.log(`- ${piles.deck.cards.size} cards in deck`);
    
    // Step 1: Get cards from table safely
    if (playerTableCards.length > 0) {
      // Safety check - see if any cards exist in multiple places
      for (const card of playerTableCards) {
        // Check if this card is already in discard or deck
        const inDiscard = piles.discard.cards.has(card.id);
        const inDeck = piles.deck.cards.has(card.id);
        
        if (inDiscard || inDeck) {
          // If duplicate, delete from table
          console.log(`${MODULE_ID} | Card ${card.id} exists in multiple piles, removing from table`);
          await card.delete();
        } else {
          // Move card from table to discard
          try {
            await tablePile.pass(piles.discard, [card.id], { chatNotification: false });
          } catch (error) {
            console.error(`${MODULE_ID} | Error moving card ${card.id} from table:`, error);
            // Try to delete it if movement fails
            await card.delete();
          }
        }
      }
    }
    
    // Step 2: Get cards from hand safely
    if (piles.hand.cards.size > 0) {
      const handCards = Array.from(piles.hand.cards);
      
      for (const card of handCards) {
        // Check if this card is already in discard or deck
        const inDiscard = piles.discard.cards.has(card.id);
        const inDeck = piles.deck.cards.has(card.id);
        
        if (inDiscard || inDeck) {
          // If duplicate, delete from hand
          console.log(`${MODULE_ID} | Card ${card.id} exists in multiple piles, removing from hand`);
          await card.delete();
        } else {
          // Move card from hand to discard
          try {
            await piles.hand.pass(piles.discard, [card.id], { chatNotification: false });
          } catch (error) {
            console.error(`${MODULE_ID} | Error moving card ${card.id} from hand:`, error);
            // Try to delete it if movement fails
            await card.delete();
          }
        }
      }
    }
    
    // Step 3: Reset drawn status for all cards in deck
    const deckCards = Array.from(piles.deck.cards);
    if (deckCards.length > 0) {
      const updates = deckCards.map(card => ({
        _id: card.id,
        drawn: false  // Ensure all cards can be drawn
      }));
      
      await piles.deck.updateEmbeddedDocuments("Card", updates);
    }
    
    // Step 4: Return all cards from discard to deck
    // If there are cards in discard, pass them back to deck
    if (piles.discard.cards.size > 0) {
      const discardCardIds = Array.from(piles.discard.cards).map(c => c.id);
      await piles.discard.pass(piles.deck, discardCardIds, { chatNotification: false });
    }
    
    // Step 5: Shuffle the deck
    await piles.deck.shuffle();
        
    // Emit socket message to update other players' views
    SocketManager.emitShuffleDeck();
    
    // Update UI
    UIManager.renderHand();
    UIManager.renderTable();
    
    ui.notifications.info("Deck shuffled successfully");
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Error shuffling deck:`, error);
    ui.notifications.error(`Failed to shuffle deck: ${error.message}`);
    return false;
  }
}

// Clean the table pile by moving cards back to their owners' discard piles
static async cleanTable() {
  const tablePile = getTablePile();
  if (!tablePile) {
    console.error(`${MODULE_ID} | Table pile not available`);
    return false;
  }
  
  const tableCards = Array.from(tablePile.cards);
  if (tableCards.length === 0) return false;
  
  // Collect all existing card IDs across all card stacks
  const existingCardIds = new Map();
  game.cards.contents.forEach(pile => {
    if (pile.id !== tablePile.id) { // Skip the table pile itself
      Array.from(pile.cards).forEach(card => {
        existingCardIds.set(card.id, {
          pileId: pile.id, 
          pileName: pile.name,
          cardName: card.name
        });
      });
    }
  });
  
  // Group table cards by status
  const toMove = []; // Cards that can be moved normally
  const toPurge = []; // Duplicate cards that need deletion
  
  // Check each table card
  for (const card of tableCards) {
    if (existingCardIds.has(card.id)) {
      // This is a duplicate - log it and mark for deletion
      const existing = existingCardIds.get(card.id);
      console.warn(`${MODULE_ID} | Found duplicate card: ${card.name} (ID: ${card.id}) already exists in ${existing.pileName}`);
      toPurge.push(card.id);
    } else {
      // Normal card - group by owner for moving
      const ownerId = card.getFlag(MODULE_ID, 'ownerId');
      if (ownerId) toMove.push({id: card.id, ownerId});
    }
  }
  
  // 1. Delete duplicate cards directly
  if (toPurge.length > 0) {
    try {
      console.log(`${MODULE_ID} | Purging ${toPurge.length} duplicate cards`);
      await tablePile.deleteEmbeddedDocuments("Card", toPurge);
    } catch (error) {
      console.error(`${MODULE_ID} | Error purging duplicates:`, error);
    }
  }
  
  // 2. Group remaining cards by owner for orderly movement
  const cardsByOwner = toMove.reduce((groups, card) => {
    if (!groups[card.ownerId]) groups[card.ownerId] = [];
    groups[card.ownerId].push(card.id);
    return groups;
  }, {});
  
  // 3. Process cards for each owner
  for (const [ownerId, cardIds] of Object.entries(cardsByOwner)) {
    try {
      const ownerPiles = getPlayerPiles(ownerId);
      if (!ownerPiles?.discard) {
        console.warn(`${MODULE_ID} | No discard pile for ${game.users.get(ownerId)?.name}`);
        continue;
      }
      
      // Move in small batches with delay
      const BATCH_SIZE = 3;
      for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
        const batch = cardIds.slice(i, i + BATCH_SIZE);
        await tablePile.pass(ownerPiles.discard, batch, { chatNotification: false });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Error moving cards for ${ownerId}:`, error);
    }
  }
  
  // Update UI
  UIManager.renderTable();
  SocketManager.emitCleanTable();
  
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
    style: CONST.CHAT_MESSAGE_STYLES.OTHER
  };
  
  // Create the chat message first to show the set activation
  const message = await ChatMessage.create(chatData);
  
  try {
    // Get the player's discard pile
    const piles = getPlayerPiles(playerId);
    
    if (!piles?.discard) {
      ui.notifications.error("Could not find your discard pile");
      return false;
    }
    
    const tablePile = getTablePile();
    if (!tablePile) {
      ui.notifications.error("Table pile not found");
      return false;
    }
    
    // Check if this is a healing or status effect set
    const isHealingSet = HealingIntegration.isHealingOrStatusSet(setData.type);
    
    // Get targets before moving cards from table
    let targets = [];
    if (isHealingSet) {
      // For healing sets, we want allies as targets
      const isFullStatusOdd = setData.type === 'full-status' && Math.max(...setData.values) % 2 !== 0;
      
      // For odd Full Status, we want enemies; for all other healing sets, we want allies
      if (isFullStatusOdd) {
        targets = Array.from(game.user.targets)
          .filter(t => t.actor && t.disposition === -1)
          .map(t => t.actor);
      } else {
        targets = Array.from(game.user.targets)
          .filter(t => t.actor && t.disposition === 1)
          .map(t => t.actor);
      }
      
      // Include the player's character as a target for healing sets
      if (character && setData.type !== 'full-status' && !targets.some(t => t.id === character.id)) {
        targets.unshift(character);
      }
    }
    
    // IMPROVED APPROACH - Move cards more safely and add debugging
    console.log(`${MODULE_ID} | Activating set ${setData.type} with cards:`, setData.cardIds);
    
    // Process cards individually for better error handling
    let movedCount = 0;
    for (const cardId of setData.cardIds) {
      // Make sure the card is still on the table
      if (!tablePile.cards.has(cardId)) {
        console.warn(`${MODULE_ID} | Card ${cardId} not found on table, skipping`);
        continue;
      }
      
      // Check if card is already in discard (should never happen)
      if (piles.discard.cards.has(cardId)) {
        console.warn(`${MODULE_ID} | Card ${cardId} already in discard pile, skipping`);
        continue;
      }
      
      try {
        // Move this card from table to discard
        await tablePile.pass(piles.discard, [cardId], { chatNotification: false });
        movedCount++;
      } catch (error) {
        console.error(`${MODULE_ID} | Error moving card ${cardId} from table to discard:`, error);
        // Try one more approach - delete from table if pass fails
        try {
          const card = tablePile.cards.get(cardId);
          if (card) {
            await card.delete();
            console.log(`${MODULE_ID} | Deleted card ${cardId} from table as fallback`);
          }
        } catch (innerError) {
          console.error(`${MODULE_ID} | Failed to delete card ${cardId}:`, innerError);
        }
      }
    }
    
    console.log(`${MODULE_ID} | Moved ${movedCount}/${setData.cardIds.length} cards to discard pile`);
    
    // Emit socket message and update UI
    SocketManager.emitSetActivated(setData.type, setData.cardIds);
    UIManager.renderTable();
    
    // Verify handlers are still attached
    if (window.FuAceCards?.EventHandlers) {
      window.FuAceCards.EventHandlers.verifyHandDrawerHandlers();
    } else if (typeof EventHandlers !== 'undefined') {
      EventHandlers.verifyHandDrawerHandlers();
    }
    
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
  const isMagicPair = setData.type === 'magic-pair';
  
  // Determine if this set targets multiple enemies or is single-target
  const isMultiTarget = ['jackpot', 'magic-flush', 'blinding-flush', 'full-status', 'triple-support', 'forbidden-monarch','double-trouble'].includes(setData.type);
  
  // Get suit information for each card
  const cardsWithSuits = setData.cards.map(card => {
    const isJoker = card.name.toLowerCase().includes('joker') || card.getFlag(MODULE_ID, 'isJoker');
    let suit = this.getCardSuit(card);
    
    // For jokers, add phantom suit information
    if (isJoker) {
      const phantomSuit = card.getFlag(MODULE_ID, 'phantomSuit');
      if (phantomSuit) {
        // Use the phantom suit instead
        suit = phantomSuit;
      }
      
      return {
        id: card.id,
        name: card.name,
        img: card.faces[card.face ?? 0]?.img,
        suit: suit,
        isJoker: true,
        phantomSuit: phantomSuit
      };
    }
    
    return {
      id: card.id,
      name: card.name,
      img: card.faces[card.face ?? 0]?.img,
      suit: suit
    };
  });

  // Get available damage types (suits) for this set
  const availableSuits = [...new Set(cardsWithSuits.map(c => c.suit))];
  
  // Get highest value for effects that need it
  const highestValue = Math.max(...setData.values);
  
  // Calculate healing data for healing sets
  const totalValue = setData.values.reduce((sum, val) => sum + val, 0);
  const isHealingSet = ['jackpot', 'triple-support'].includes(setData.type);
  const isStatusSet = setData.type === 'full-status';
  const healingData = isHealingSet ? {
    type: setData.type,
    value: setData.type === 'jackpot' ? 777 : totalValue * 3
  } : null;
  
  // Status effect data for Full Status
  const statusData = isStatusSet ? {
    highestValue: highestValue,
    isEven: highestValue % 2 === 0,
    mode: highestValue % 2 === 0 ? 'remove' : 'apply',
    target: highestValue % 2 === 0 ? 'allies' : 'enemies'
  } : null;
  
  // Prepare data for template
  const templateData = {
    debugInfo: game.user.isGM && game.settings.get(MODULE_ID, 'debug'), // Only if you have a debug setting
    highestValue: damageData?.highestValue || highestValue,
    isEven: (damageData?.highestValue || highestValue) % 2 === 0,
    setType: setData.type,
    setName: SET_NAMES[setData.type],
    playerName: displayName,
    actorId: actorId,
    playerId: playerId,
    mpCost: mpCost,
    effect: description.effect,
    comboDescription: description.base,
    isMultiTarget: isMultiTarget, // Added for targeting info
    isDoubleTrouble: isDoubleTrouble,
    isMagicPair: isMagicPair,
    cards: cardsWithSuits,
    availableSuits: availableSuits,
    
    // Damage data
    hasDamage: damageData !== null,
    damageValue: damageData?.value || 0,
    damageType: damageData?.type || '',
    damageTypeLabel: damageData?.type ? game.i18n.localize(`FU.Damage${window.capitalize(damageData.type)}`) || damageData.type.toUpperCase() : '',
    highRoll: damageData?.highRoll || 0,
    baseDamage: damageData?.baseDamage || 0,
    
    // Healing data
    isHealingSet: isHealingSet,
    healingData: healingData,
    
    // Status effect data
    isStatusSet: isStatusSet,
    statusData: statusData,
    totalValue: totalValue
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