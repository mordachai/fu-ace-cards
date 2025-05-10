// scripts/main.js
const MODULE_ID = 'fu-ace-cards';

Hooks.once('init', () => console.log(`${MODULE_ID} | Initializing module`));

Hooks.once('ready', async () => {
  const user = game.user;
  if (!user.isGM && !user.character) return;

  // Locate piles with retry mechanism
  const PILE_NAMES = {
    deck:    'Ace of Cards Deck',
    table:   'Table',
    discard: 'Ace of Cards Discard Pile'
  };
  
  async function waitForPiles(maxAttempts = 10, delay = 1000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const piles = {};
      let allFound = true;
      
      for (const [key, name] of Object.entries(PILE_NAMES)) {
        const pile = game.cards.getName(name);
        if (!pile) {
          allFound = false;
          break;
        }
        piles[key] = pile;
      }
      
      if (allFound) return piles;
      
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error(`Required card piles not found after ${maxAttempts} attempts`);
  }

  let piles;
  try {
    piles = await waitForPiles();
  } catch (error) {
    ui.notifications.error(`${MODULE_ID} | ${error.message}`);
    return;
  }

  // GM resets deck if empty
  if (user.isGM && piles.deck.cards.size === 0) {
    await piles.discard.reset({ shuffle: true });
    ui.notifications.info('♻️ Deck reset & shuffled by GM');
  }

  // Check if template exists before rendering
  let html;
  try {
    html = await renderTemplate(
      `modules/${MODULE_ID}/templates/areas.hbs`,
      {
        isGM: user.isGM,
        hasHandCards: !!game.cards.find(c =>
          c.type === 'hand' &&
          c.getUserLevel(user) === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        )
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
    const ids = piles.table.cards.map(c => c.id);
    if (!ids.length) return ui.notifications.info('Table empty');
    await piles.table.pass(piles.discard, ids, { chatNotification: false });
    renderTable();
    // Emit socket message to notify other players
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'cleanTable',
      senderId: game.userId
    });
    ui.notifications.info('Table cleared');
  };

  const drawCard = async () => {
    const hand = game.cards.find(c =>
      c.type === 'hand' &&
      c.getUserLevel(user) === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    );
    if (!hand) return;
    if (piles.deck.cards.size === 0) return ui.notifications.warn('Deck empty');
    await piles.deck.deal([hand], 1, { how: CONST.CARD_DRAW_MODES.RANDOM, chatNotification: false });
    renderHand();
    ui.notifications.info('You drew a card');
  };

  const resetHand = async () => {
    const hand = game.cards.find(c =>
      c.type === 'hand' &&
      c.getUserLevel(user) === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    );
    if (!hand) return;
    const ids = hand.cards.map(c => c.id);
    if (!ids.length) return ui.notifications.info('Hand empty');
    await hand.pass(piles.discard, ids, { chatNotification: false });
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
    const cards = piles.table.cards;

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
    const hand = game.cards.find(c =>
      c.type === 'hand' &&
      c.getUserLevel(user) === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    );
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
          await hand.pass(piles.table, [c.id], { chatNotification: false });
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
  Hooks.on('passCards', () => {
    renderTable();
    if (document.getElementById('fu-hand-cards')) renderHand();
  });
  
  // Socket handler with validation
  game.socket.on(`module.${MODULE_ID}`, async msg => {
    if (msg.senderId === game.userId) return; // Ignore own messages
    
    switch (msg.action) {
      case 'cardToTable':
        // Validate that the card actually was moved to the table
        const tableCard = piles.table.cards.get(msg.cardId);
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