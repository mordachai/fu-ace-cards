// scripts/deck-manager.js
export class DeckManager {
  static MODULE_ID = 'fu-ace-cards';
  static SETTINGS = {
    DECK_MAPPINGS: 'deckMappings'
  };

  static init() {
    // Register module settings
    game.settings.register(this.MODULE_ID, this.SETTINGS.DECK_MAPPINGS, {
      name: 'Player Deck Mappings',
      hint: 'Stores the mapping between players and their card decks',
      scope: 'world',
      config: false,
      type: Object,
      default: {}
    });

    // Register GM menu for deck assignment
    game.settings.registerMenu(this.MODULE_ID, 'deckAssignmentMenu', {
      name: 'Assign Player Decks',
      label: 'Deck Assignment',
      hint: 'Assign card decks to players',
      icon: 'fas fa-cards',
      type: DeckAssignmentDialog,
      restricted: true
    });
  }

  static getDeckMapping() {
    return game.settings.get(this.MODULE_ID, this.SETTINGS.DECK_MAPPINGS);
  }

  static async setDeckMapping(userId, deckData) {
    const mappings = this.getDeckMapping();
    mappings[userId] = deckData;
    await game.settings.set(this.MODULE_ID, this.SETTINGS.DECK_MAPPINGS, mappings);
  }

  static async removeDeckMapping(userId) {
    const mappings = this.getDeckMapping();
    delete mappings[userId];
    await game.settings.set(this.MODULE_ID, this.SETTINGS.DECK_MAPPINGS, mappings);
  }

  static getPlayerDecks(userId) {
    const mappings = this.getDeckMapping();
    return mappings[userId] || null;
  }

  static async findOrCreatePlayerPiles(userId) {
    let deckData = this.getPlayerDecks(userId);
    
    if (!deckData) {
      // No deck assignment for this player
      return null;
    }

    // Find the actual card stacks by ID
    const piles = {
      deck: deckData.deckId ? game.cards.get(deckData.deckId) : null,
      hand: deckData.handId ? game.cards.get(deckData.handId) : null,
      discard: deckData.discardId ? game.cards.get(deckData.discardId) : null
    };

    // Validate all required piles exist
    if (!piles.deck || !piles.hand || !piles.discard) {
      ui.notifications.warn(`Missing card stacks for player ${game.users.get(userId).name}. Please assign decks in module settings.`);
      return null;
    }

    return piles;
  }
}

// Dialog for GM to assign decks to players
class DeckAssignmentDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: 'Assign Player Decks',
      id: 'deck-assignment-dialog',
      template: `modules/${DeckManager.MODULE_ID}/templates/deck-assignment.hbs`,
      width: 600,
      height: 500,
      resizable: true
    });
  }

  getData() {
    const mappings = DeckManager.getDeckMapping();
    const players = game.users.filter(u => !u.isGM);
    
    // Get all card stacks grouped by type
    const allCardStacks = game.cards.contents;
    const deckOptions = allCardStacks.filter(c => c.type === 'deck').map(c => ({
      id: c.id,
      name: c.name
    }));
    const handOptions = allCardStacks.filter(c => c.type === 'hand').map(c => ({
      id: c.id,
      name: c.name
    }));
    const pileOptions = allCardStacks.filter(c => c.type === 'pile').map(c => ({
      id: c.id,
      name: c.name
    }));
    
    const playerData = players.map(player => {
      const mapping = mappings[player.id] || {};
      return {
        id: player.id,
        name: player.name,
        hasAceClass: true, // TODO: Check if player has Ace of Cards class
        deckId: mapping.deckId || '',
        handId: mapping.handId || '',
        discardId: mapping.discardId || ''
      };
    });

    return {
      players: playerData,
      deckOptions,
      handOptions,
      pileOptions
    };
  }

  async _updateObject(event, formData) {
    // Save each player's mapping using card IDs
    for (const key in formData) {
      const [playerId, type] = key.split('-');
      const cardId = formData[key];
      
      if (cardId) {
        const currentMapping = DeckManager.getPlayerDecks(playerId) || {};
        currentMapping[`${type}Id`] = cardId;
        await DeckManager.setDeckMapping(playerId, currentMapping);
      }
    }

    ui.notifications.info('Deck assignments saved!');
  }
}