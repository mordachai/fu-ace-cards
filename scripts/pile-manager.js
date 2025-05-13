// scripts/pile-manager.js
import { MODULE_ID } from './settings.js';
import { DeckManager } from './deck-manager.js';

// Cache for player deck piles
let playerDecks = {};
// Shared table pile
let tablePile = null;

export class PileManager {
  // Initialize the pile manager
  static async initialize() {
    console.log(`${MODULE_ID} | Initializing pile manager`);
    
    // Find the shared table pile
    tablePile = game.cards.getName('Table');
    if (!tablePile) {
      if (game.user.isGM) {
        tablePile = await Cards.create({
          name: 'Table',
          type: 'pile',
          permission: { default: 2 }
        });
        ui.notifications.info('Created shared table pile');
      } else {
        ui.notifications.error('Table pile not found. Please ask GM to create it.');
        return false;
      }
    }

    // Get player-specific piles
    const userId = game.user.id;
    let piles = null;
    
    try {
      playerDecks[userId] = await DeckManager.findOrCreatePlayerPiles(userId);
      piles = playerDecks[userId];
    } catch (error) {
      console.log(`${MODULE_ID} | No decks assigned for ${game.user.name}`);
    }
    
    // Only reset deck if user has their own deck assigned and it's empty
    if (piles?.deck?.cards.size === 0) {
      await piles.discard.reset({ shuffle: true });
      ui.notifications.info('♻️ Deck reset & shuffled');
    }
    
    return true;
  }
  
  // Get the current player's piles
  static getCurrentPlayerPiles() {
    return playerDecks[game.user.id];
  }
  
  // Get any player's piles by ID
  static getPlayerPiles(userId) {
    return playerDecks[userId];
  }
  
  // Set piles for a player
  static setPlayerPiles(userId, piles) {
    playerDecks[userId] = piles;
  }
  
  // Get the table pile
  static getTablePile() {
    return tablePile;
  }
  
  // Reset a player's deck
  static async resetPlayerDeck(userId) {
    const piles = this.getPlayerPiles(userId);
    if (!piles?.deck || !piles?.discard) {
      return false;
    }
    
    await piles.discard.reset({ shuffle: true });
    return true;
  }
  
  // Draw a hand of 5 cards
  static async drawStartingHand(userId) {
    const piles = this.getPlayerPiles(userId);
    if (!piles?.deck || !piles?.hand) {
      return false;
    }
    
    // Clear hand first
    if (piles.hand.cards.size > 0) {
      const handCardIds = Array.from(piles.hand.cards).map(c => c.id);
      await piles.hand.pass(piles.discard, handCardIds, { chatNotification: false });
    }
    
    // Draw 5 cards
    await piles.deck.deal([piles.hand], 5, { how: CONST.CARD_DRAW_MODES.RANDOM, chatNotification: false });
    return true;
  }
  
  // Check if a player's deck is empty
  static isDeckEmpty(userId) {
    const piles = this.getPlayerPiles(userId);
    return !piles?.deck || piles.deck.cards.size === 0;
  }
  
  // Check if a player's hand is empty
  static isHandEmpty(userId) {
    const piles = this.getPlayerPiles(userId);
    return !piles?.hand || piles.hand.cards.size === 0;
  }
  
  // Get hand size for a player
  static getHandSize(userId) {
    const piles = this.getPlayerPiles(userId);
    return piles?.hand ? piles.hand.cards.size : 0;
  }
  
  // Get deck size for a player
  static getDeckSize(userId) {
    const piles = this.getPlayerPiles(userId);
    return piles?.deck ? piles.deck.cards.size : 0;
  }
  
  // Get discard size for a player
  static getDiscardSize(userId) {
    const piles = this.getPlayerPiles(userId);
    return piles?.discard ? piles.discard.cards.size : 0;
  }
  
  // Refresh piles from the DeckManager
  static async refreshPlayerPiles(userId) {
    playerDecks[userId] = await DeckManager.findOrCreatePlayerPiles(userId);
    return !!playerDecks[userId];
  }
  
  // Refresh all player piles
  static async refreshAllPiles() {
    const promises = [];
    for (const userId of Object.keys(playerDecks)) {
      promises.push(this.refreshPlayerPiles(userId));
    }
    await Promise.all(promises);
  }
  
  // Get all cards on the table
  static getTableCards() {
    return tablePile ? Array.from(tablePile.cards) : [];
  }
  
  // Check if there are cards on the table
  static isTableEmpty() {
    return !tablePile || tablePile.cards.size === 0;
  }
  
  // Get cards from a player's hand
  static getHandCards(userId) {
    const piles = this.getPlayerPiles(userId);
    return piles?.hand ? Array.from(piles.hand.cards) : [];
  }
}

// Expose global accessors for compatibility with existing code
export function getCurrentPlayerPiles() {
  return PileManager.getCurrentPlayerPiles();
}

export function getPlayerPiles(userId) {
  return PileManager.getPlayerPiles(userId);
}

export function getTablePile() {
  return PileManager.getTablePile();
}