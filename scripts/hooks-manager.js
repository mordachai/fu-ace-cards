// scripts/hooks-manager.js
import { MODULE_ID } from './settings.js';
import { UIManager } from './ui-manager.js';
import { PileManager } from './pile-manager.js';
import { EventHandlers } from './event-handlers.js';
import { CardController } from './card-controller.js';
import { SocketManager } from './socket-manager.js';
import { DeckManager } from './deck-manager.js';

export class HooksManager {
  
  // Register all Foundry VTT hooks
  static register() {
    console.log(`${MODULE_ID} | Registering hooks`);
    
    // init hook - register settings and initialize module
    Hooks.once('init', this.onInit.bind(this));
    
    // ready hook - set up module when Foundry is ready
    Hooks.once('ready', this.onReady.bind(this));
    
    // updateCards hook - refresh displays when card stacks change
    Hooks.on('updateCards', this.onUpdateCards.bind(this));
    
    // updateActor hook - refresh displays when actor data changes
    Hooks.on('updateActor', this.onUpdateActor.bind(this));
    
    // canvasReady hook - clean up tooltips on scene changes
    Hooks.on('canvasReady', this.onCanvasReady.bind(this));
    
    // renderChatMessage hook - process card set messages in chat
    Hooks.on('renderChatMessage', this.onRenderChatMessage.bind(this));
    
    // closeApplication hook - clean up when closing applications
    Hooks.once('closeApplication', this.onCloseApplication.bind(this));
    
    return true;
  }
  
  // Handler for init hook
  static onInit() {
    console.log(`${MODULE_ID} | Initializing module`);
    
    // Register module settings FIRST
    const { registerSettings } = game.modules.get(MODULE_ID).api || 
                                import('./settings.js');
    if (typeof registerSettings === "function") {
        registerSettings();
    } else {
        // Direct import as fallback
        import('./settings.js').then(module => {
        if (typeof module.registerSettings === "function") {
            module.registerSettings();
        }
        });
    }
    
    // Then initialize DeckManager
    DeckManager.init();
    
    // Register Handlebars helper for equality check
    Handlebars.registerHelper('eq', function(a, b) {
        return a === b;
    });
  }
  
  // Handler for ready hook - MODIFIED
  static async onReady() {
    console.log(`${MODULE_ID} | Module ready`);

    // Register UI hooks to maintain handlers
    this.registerUIHooks();
    
    try {
      // Initialize managers
      SocketManager.initialize();
      await PileManager.initialize();
      UIManager.initialize();
      
      // Render UI areas
      await this.renderUIAreas();
      
      // Initialize event handlers
      EventHandlers.initialize();
      
      // Setup chat message handlers
      EventHandlers.setupChatMessageHandlers();
      
      // Setup hand drawer behavior - Always ensure this happens
      EventHandlers.setupHandDrawer();
      
      // Setup healing and status effect handlers
      //EventHandlers.setupHealingButtons(document.body);
      
      // Expose global API
      await this.exposeGlobalAPI();
      
      // Wait a moment for global API to be fully registered
      setTimeout(() => {
        // Initial rendering
        UIManager.renderTable();
        UIManager.renderHand();
        
        // Make sure hand area is fully functional - ADDED
        this.verifyHandAreaFunctionality();
        
        console.log(`${MODULE_ID} | Ready and UI rendered`);
      }, 100);
    } catch (error) {
      console.error(`${MODULE_ID} | Initialization error:`, error);
    }
  }
  
  // New utility method to verify hand area functionality - ADDED
  static verifyHandAreaFunctionality() {
    // Try to use the global API if available
    if (window.FuAceCards?.EventHandlers?.verifyHandDrawerHandlers) {
      window.FuAceCards.EventHandlers.verifyHandDrawerHandlers();
    } else if (typeof EventHandlers !== 'undefined') {
      // Direct reference if global API isn't available yet
      EventHandlers.verifyHandDrawerHandlers();
    }
  }
  
  // Render UI areas by loading templates - MODIFIED
  static async renderUIAreas() {
    const user = game.user;
    
    // Get player-specific piles
    const piles = PileManager.getCurrentPlayerPiles();
    
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
      return false;
    }
    
    document.body.insertAdjacentHTML('beforeend', html);
    
    // After rendering UI areas, ensure event handlers are set up - ADDED
    // This is important as this is when the DOM elements are first created
    setTimeout(() => {
      this.verifyHandAreaFunctionality();
    }, 100);
    
    return true;
  }

  static registerUIHooks() {
  // Key UI events that might affect our elements
  Hooks.on('renderSidebarTab', () => this.ensureHandlersAttached());
  Hooks.on('renderChatMessage', () => this.ensureHandlersAttached());
  Hooks.on('renderApplication', () => this.ensureHandlersAttached());
  Hooks.on('renderDialog', () => this.ensureHandlersAttached());
  
  // Critical Foundry events
  Hooks.on('updateJournalEntry', () => this.ensureHandlersAttached());
  Hooks.on('ready', () => this.ensureHandlersAttached());
  Hooks.on('canvasReady', () => this.ensureHandlersAttached());
  
  console.log(`${MODULE_ID} | UI hooks registered for handler preservation`);
  }

static ensureHandlersAttached() {
  // Only verify if module is initialized
  if (window.FuAceCards?.EventHandlers) {
    window.FuAceCards.EventHandlers.verifyAllHandlers();
  } else if (typeof EventHandlers !== 'undefined') {
    EventHandlers.verifyAllHandlers();
  }
}
  
  // Handler for updateCards hook - MODIFIED
// Handler for updateCards hook - MODIFIED
static onUpdateCards(cards, change, options, userId) {
  // Always clean up tooltips when cards change
  UIManager.cleanupAllTooltips();
  
  // Refresh displays when specific card stacks change
  const tablePile = PileManager.getTablePile();
  const playerPiles = PileManager.getCurrentPlayerPiles();
  
  if (cards === tablePile || 
      (playerPiles && (cards === playerPiles.deck || cards === playerPiles.hand || cards === playerPiles.discard))) {
    
    // Force table to show if cards were added to it
    if (cards === tablePile && cards.cards.size > 0) {
      const tableArea = document.getElementById('fu-table-area');
      if (tableArea) {
        tableArea.style.display = 'flex';
      }
    }
    
    UIManager.renderTable();
    UIManager.renderHand();
    
    // Verify hand area functionality after card updates - ADDED
    this.verifyHandAreaFunctionality();
  }
}
  
  // Handler for updateActor hook - MODIFIED
  static onUpdateActor(actor, changes) {
    // If MP changed and this is our character
    if (actor.id === game.user.character?.id && 
        changes.system?.resources?.mp) {
      // Re-render hand to update set availability
      UIManager.renderHand();
      
      // Verify hand area functionality - ADDED
      this.verifyHandAreaFunctionality();
    }
  }
  
  // Handler for canvasReady hook - MODIFIED
  static onCanvasReady() {
    // Clean up tooltips when the scene changes
    UIManager.cleanupAllTooltips();
    
    // Ensure hand area functionality after scene changes - ADDED
    // Scene changes can sometimes cause event handlers to get detached
    setTimeout(() => {
      this.verifyHandAreaFunctionality();
    }, 500); // Longer timeout for scene changes which can be resource-intensive
  }
  
  // Handler for renderChatMessage hook
  static onRenderChatMessage(message, html, data) {
    // Already handled by EventHandlers.setupChatMessageHandlers()
    // But we keep this hook registered for future extensions
  }
  
  // Handler for closeApplication hook
  static onCloseApplication() {
    // Clean up event listeners
    EventHandlers.cleanup();
    
    // Clean up all tooltips
    UIManager.cleanupAllTooltips();
    
    // Remove socket listener
    game.socket.off(`module.${MODULE_ID}`);
    
    console.log(`${MODULE_ID} | Module cleanup completed`);
  }
  
  // Expose global API for module - MODIFIED
  static exposeGlobalAPI() {
    // Import necessary functions/objects
    import('./ui-enhancements.js').then(uiModule => {
      import('./set-detector.js').then(detectorModule => {
        import('./damage-integration.js').then(damageModule => {
          import('./healing-integration.js').then(healingModule => {
            import('./dialog-manager.js').then(dialogModule => {
              // Create global access point
              window.FuAceCards = {
                // Managers
                UIManager,
                CardController,
                PileManager,
                SocketManager,
                EventHandlers,
                DialogManager: dialogModule.DialogManager,
                
                // Convenience methods
                renderHand: UIManager.renderHand.bind(UIManager),
                renderTable: UIManager.renderTable.bind(UIManager),
                showHandArea: UIManager.showHandArea.bind(UIManager),
                getCurrentPlayerPiles: PileManager.getCurrentPlayerPiles.bind(PileManager),
                getTablePile: PileManager.getTablePile.bind(PileManager),
                discardCard: CardController.discardCard.bind(CardController),
                
                // Event handlers
                handleHandSetClick: EventHandlers.handleHandSetClick.bind(EventHandlers),
                handleTableSetClick: EventHandlers.handleTableSetClick.bind(EventHandlers),
                
                // UI enhancement functions
                updateSetInfoBar: uiModule.updateSetInfoBar,
                showSetTooltip: uiModule.showSetTooltip,
                hideSetTooltip: uiModule.hideSetTooltip,
                clearHighlights: uiModule.clearHighlights,
                
                // Set detection
                SET_NAMES: detectorModule.SET_NAMES,
                getCardValue: detectorModule.getCardValue,
                
                // Damage and Healing integration
                DamageIntegration: damageModule.DamageIntegration,
                HealingIntegration: healingModule.HealingIntegration,
                
                // Add new hand area functionality methods - ADDED
                ensureHandFunctionality: () => EventHandlers.verifyHandDrawerHandlers(),
                resetHandDrawer: () => {
                  EventHandlers.cleanupHandDrawer();
                  EventHandlers.setupHandDrawer();
                },
                
                // Module ID for reference
                MODULE_ID
              };
              
              console.log(`${MODULE_ID} | Global API exposed successfully`);
              
              // Verify hand area functionality after API is exposed - ADDED
              setTimeout(() => {
                EventHandlers.verifyHandDrawerHandlers();
              }, 200);
            });
          });
        });
      });
    });
  }
}