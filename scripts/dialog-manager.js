// scripts/dialog-manager.js
import { MODULE_ID } from './settings.js';
import { UIManager } from './ui-manager.js';

export class DialogManager {
  
  // Open joker dialog
  static async openJokerDialog(jokerCard) {
    // Get currently set values if any
    const currentSuit = jokerCard.getFlag(MODULE_ID, 'phantomSuit') || '';
    const currentValue = jokerCard.getFlag(MODULE_ID, 'phantomValue') || '';

    // Define suit data
    const suits = [
      { value: 'hearts', symbol: '♥️', element: 'Fire', color: '#e51c23' },
      { value: 'diamonds', symbol: '♦️', element: 'Air', color: '#e91e63' },
      { value: 'clubs', symbol: '♣️', element: 'Earth', color: '#212121' },
      { value: 'spades', symbol: '♠️', element: 'Ice', color: '#212121' }
    ];

    // Prepare values array (1-7)
    const values = Array.from({ length: 7 }, (_, i) => i + 1);
    
    // Render the template with data
    const content = await renderTemplate(`modules/${MODULE_ID}/templates/joker-dialog.hbs`, {
      currentSuit,
      currentValue,
      suits,
      values
    });
    
    // Helper function to update UI after dialog
    function refreshHandDisplay() {
      UIManager.showHandArea();
      UIManager.renderHand();
      
      const piles = window.FuAceCards.getCurrentPlayerPiles();
      if (piles?.hand) {
        window.FuAceCards.updateSetInfoBar(
          Array.from(piles.hand.cards), 
          'hand', 
          window.FuAceCards.handleHandSetClick
        );
      }
    }

    // Create and show dialog - use Foundry's button system
    new Dialog({
      title: "🃏 Assign Joker Values",
      content: content,
      buttons: {
        assign: {
          icon: '<i class="fas fa-check"></i>',
          label: "Assign",
          callback: async html => {
            const suit = html.find('#selected-suit').val();
            const value = parseInt(html.find('#selected-value').val());
            
            // Only proceed if both values are valid
            if (!suit || isNaN(value)) {
              ui.notifications.warn("Please select both a suit and a value");
              return;
            }
            
            // Save the phantom values on the card
            await jokerCard.setFlag(MODULE_ID, 'phantomSuit', suit);
            await jokerCard.setFlag(MODULE_ID, 'phantomValue', value);
            
            // Show notification
            ui.notifications.info(`Joker set as ${value} of ${window.capitalize(suit)}`);
            
            // Update UI
            refreshHandDisplay();
          }
        },
        clear: {
          icon: '<i class="fas fa-eraser"></i>',
          label: "Clear",
          callback: async () => {
            // Remove phantom values
            await jokerCard.unsetFlag(MODULE_ID, 'phantomSuit');
            await jokerCard.unsetFlag(MODULE_ID, 'phantomValue');
            
            // Show notification
            ui.notifications.info("Joker value cleared");
            
            // Update UI
            refreshHandDisplay();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => {
            // Update UI
            refreshHandDisplay();
          }
        }
      },
      default: "assign",
      close: () => {
        // In case dialog is closed without button press
        refreshHandDisplay();
      },
      width: 300,
      classes: ["projectfu"]
    }).render(true);
  }
}