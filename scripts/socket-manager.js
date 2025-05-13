// scripts/socket-manager.js
import { MODULE_ID } from './settings.js';

export class SocketManager {
  
  // Initialize socket listeners
  static initialize() {
    game.socket.on(`module.${MODULE_ID}`, this.handleSocketMessage.bind(this));
    console.log(`${MODULE_ID} | Socket initialized`);
  }
  
  // Handle incoming socket messages
  static handleSocketMessage(msg) {
    if (msg.senderId === game.userId) return; // Ignore own messages
    
    // Clean up tooltips on all socket messages
    if (window.FuAceCards?.UIManager) {
      window.FuAceCards.UIManager.cleanupAllTooltips();
    }
    
    switch (msg.action) {
      case 'cardToTable':
        this.handleCardToTable(msg);
        break;
        
      case 'cleanTable':
        this.handleCleanTable(msg);
        break;
        
      case 'setPlayed':
        this.handleSetPlayed(msg);
        break;
        
      case 'setActivated':
        this.handleSetActivated(msg);
        break;
        
      default:
        console.warn(`${MODULE_ID} | Unknown socket action:`, msg.action);
    }
  }
  
  // Handle a card being played to the table
  static handleCardToTable(msg) {
    // Validate that the card actually was moved to the table
    const tablePile = window.FuAceCards?.getTablePile();
    if (!tablePile) return;
    
    const tableCard = tablePile.cards.get(msg.cardId);
    if (tableCard) {
      if (window.FuAceCards?.UIManager) {
        window.FuAceCards.UIManager.renderTable();
      }
    }
  }
  
  // Handle the table being cleaned
  static handleCleanTable(msg) {
    // Another player cleaned the table, update our view
    if (window.FuAceCards?.UIManager) {
      window.FuAceCards.UIManager.renderTable();
    }
  }
  
  // Handle a set being played
  static handleSetPlayed(msg) {
    // Another player played a set, update our view
    if (window.FuAceCards?.UIManager) {
      window.FuAceCards.UIManager.renderTable();
    }
  }
  
  // Handle a set being activated
  static handleSetActivated(msg) {
    // Another player activated a set and discarded the cards, update our view
    if (window.FuAceCards?.UIManager) {
      window.FuAceCards.UIManager.renderTable();
    }
  }
  
  // Emit a card played to table
  static emitCardToTable(cardId) {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'cardToTable',
      cardId: cardId,
      senderId: game.userId
    });
  }
  
  // Emit a set played to table
  static emitSetPlayed(setType, cardIds) {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'setPlayed',
      setType: setType,
      cardIds: cardIds,
      playerId: game.userId
    });
  }
  
  // Emit a set activated
  static emitSetActivated(setType, cardIds) {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'setActivated',
      setType: setType,
      cardIds: cardIds,
      playerId: game.userId
    });
  }
  
  // Emit table cleaned
  static emitCleanTable() {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'cleanTable',
      senderId: game.userId
    });
  }
}