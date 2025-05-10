// scripts/main.js
import { DeckManager } from './deck-manager.js';

const MODULE_ID = 'fu-ace-cards';

// Player deck tracking
let playerDecks = {};
let tablePile = null;

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing module`);
  DeckManager.init();
  
  // Register Handlebars helper for equality check
  Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });
});

Hooks.once('ready', async () => {
  const user = game.user;
  // Remove the character check - all users should see the table

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
  
  // Try to get player decks (but don't fail if they don't exist)
  try {
    playerDecks[userId] = await DeckManager.findOrCreatePlayerPiles(userId);
    piles = playerDecks[userId];
  } catch (error) {
    console.log(`${MODULE_ID} | No decks assigned for ${user.name}`);
  }
  
  // Only reset deck if user has their own deck assigned
  if (piles?.deck?.cards.size === 0) {
    await piles.discard.reset({ shuffle: true });
    ui.notifications.info('♻️ Deck reset & shuffled');
  }

  // Everyone should see the table
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

  // Cache elements
  const tableCards = document.getElementById('fu-table-cards');
  const handCards  = document.getElementById('fu-hand-cards');
  const btnClean   = document.getElementById('fu-clean-table');
  const btnDraw    = document.getElementById('fu-draw-card');
  const btnReset   = document.getElementById('fu-reset-hand');
  const handArea   = document.getElementById('fu-hand-area');

  // Track timeout for cleanup
  let drawerTimeout;
  
  // Drawer behavior (hand area)
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

  // Button handlers
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
    
    renderTable();
    // Emit socket message to notify other players
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'cleanTable',
      senderId: game.userId
    });
    ui.notifications.info('Table cleared');
  };

  const drawCard = async () => {
    if (!piles?.deck) return ui.notifications.warn('No deck assigned');
    if (piles.deck.cards.size === 0) return ui.notifications.warn('Deck empty');
    await piles.deck.deal([piles.hand], 1, { how: CONST.CARD_DRAW_MODES.RANDOM, chatNotification: false });
    renderHand();
    ui.notifications.info('You drew a card');
  };

  const resetHand = async () => {
    if (!piles?.hand) return ui.notifications.warn('No hand assigned');
    const ids = piles.hand.cards.map(c => c.id);
    if (!ids.length) return ui.notifications.info('Hand empty');
    await piles.hand.pass(piles.discard, ids, { chatNotification: false });
    renderHand();
    ui.notifications.info('Hand reset');
  };

  btnClean?.addEventListener('click', cleanTable);
  btnDraw?.addEventListener('click', drawCard);  
  btnReset?.addEventListener('click', resetHand);

  // Store cleanup functions
  if (btnClean) btnClean._cleanup = () => btnClean.removeEventListener('click', cleanTable);
  if (btnDraw) btnDraw._cleanup = () => btnDraw.removeEventListener('click', drawCard);
  if (btnReset) btnReset._cleanup = () => btnReset.removeEventListener('click', resetHand);

  // Render functions
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
      container.appendChild(d);
    }
  }
  
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
      d.addEventListener('click', async () => {
        // Validate the card is still in hand before attempting to pass
        if (!hand.cards.has(c.id)) {
          ui.notifications.warn('Card no longer in hand');
          renderHand();
          return;
        }
        
        try {
          await hand.pass(tablePile, [c.id], { chatNotification: false });
          
          // Set owner flag on the card
          await tablePile.cards.get(c.id).setFlag(MODULE_ID, 'ownerId', game.userId);
          
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
  }

  // Hooks & socket
  Hooks.on('updateCards', (cards, change, options, userId) => {
    // Refresh displays when card stacks change
    if (cards === tablePile || 
        Object.values(playerDecks).some(p => cards === p?.deck || cards === p?.hand || cards === p?.discard)) {
      renderTable();
      if (document.getElementById('fu-hand-cards')) renderHand();
    }
  });
  
  // Socket handler with validation
  game.socket.on(`module.${MODULE_ID}`, async msg => {
    if (msg.senderId === game.userId) return; // Ignore own messages
    
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
    }
  });

  // Cleanup function for module disable/re-enable
  Hooks.once('closeApplication', () => {
    // Clean up event listeners
    handArea?._cleanupDrawer?.();
    btnClean?._cleanup?.();
    btnDraw?._cleanup?.();
    btnReset?._cleanup?.();
    
    // Remove socket listener
    game.socket.off(`module.${MODULE_ID}`);
  });

  // Initial render
  renderTable();
  renderHand();
  console.log(`${MODULE_ID} | Ready`);
});