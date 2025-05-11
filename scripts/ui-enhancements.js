// scripts/ui-enhancements.js
import { MODULE_ID, SETTINGS_KEYS } from './settings.js';
import { detectFabulaUltimaSets, SET_NAMES, getSetColor } from './set-detector.js';

// Player color cache
const playerColorCache = new Map();

// Get player color with caching
export function getPlayerColor(userId) {
  if (playerColorCache.has(userId)) {
    return playerColorCache.get(userId);
  }
  
  const user = game.users.get(userId);
  const color = user?.color || '#FFFFFF';
  playerColorCache.set(userId, color);
  return color;
}

// Apply player color to card element
export function applyPlayerColor(cardElement, card) {
  if (!game.settings.get(MODULE_ID, SETTINGS_KEYS.SHOW_PLAYER_COLORS)) return;
  
  const ownerId = card.getFlag(MODULE_ID, 'ownerId');
  if (ownerId) {
    const color = getPlayerColor(ownerId);
    cardElement.dataset.ownerId = ownerId;
    cardElement.style.setProperty('--player-color', color);
    cardElement.classList.add('fu-card-owned');
  }
}

// Create tooltip for card
export function createCardTooltip(card) {
  if (!game.settings.get(MODULE_ID, SETTINGS_KEYS.SHOW_TOOLTIPS)) return '';
  
  const ownerId = card.getFlag(MODULE_ID, 'ownerId');
  const owner = ownerId ? game.users.get(ownerId) : null;
  
  let tooltip = card.name;
  if (owner) {
    tooltip += ` (${owner.name})`;
  }
  
  return tooltip;
}

// Update set info bar
export function updateSetInfoBar(cards, containerType, clickHandler) {
  const infoBar = document.getElementById(`fu-${containerType}-info-bar`);
  if (!infoBar) return;
  
  const showSetNames = game.settings.get(MODULE_ID, SETTINGS_KEYS.SHOW_SET_NAMES);
  const infoStyle = game.settings.get(MODULE_ID, SETTINGS_KEYS.SET_INFO_STYLE);
  
  if (!showSetNames || infoStyle === 'none') {
    infoBar.classList.remove('has-sets');
    infoBar.innerHTML = '';
    return;
  }
  
  // Apply style class
  infoBar.className = `fu-set-info-bar ${infoStyle}`;
  
  if (containerType === 'hand') {
    updateHandSetDisplay(cards, infoBar, clickHandler);
  } else if (containerType === 'table') {
    updateTableSetDisplay(cards, infoBar, clickHandler);
  }
}

// Update hand set display with MP costs
function updateHandSetDisplay(cards, infoBar, clickHandler) {
  const detectedSets = detectFabulaUltimaSets(cards);
  
  if (detectedSets.length === 0) {
    infoBar.classList.remove('has-sets');
    infoBar.innerHTML = '';
    return;
  }
  
  infoBar.classList.add('has-sets');
  infoBar.innerHTML = detectedSets.map(set => {
    const mpCost = calculateMPCost(set);
    const canAfford = canAffordMP(mpCost);
    const maxSpend = getMaxMPSpend();
    
    // Check if set exceeds max MP spending limit
    const exceedsLimit = mpCost > maxSpend;
    
    let className = 'fu-set-indicator';
    let tooltip = `${SET_NAMES[set.type]} - Cost: ${mpCost} MP`;
    
    if (exceedsLimit) {
      className += ' insufficient-mp exceeds-limit';
      tooltip += ` (Max: ${maxSpend} MP)`;
    } else if (!canAfford) {
      className += ' insufficient-mp';
      tooltip += ' (Not enough MP)';
    } else {
      className += ' available';
    }
    
    return `
      <div class="${className} ${set.type}" 
           style="--set-color: ${getSetColor(set.type)}"
           data-set-type="${set.type}"
           data-card-ids="${set.cardIds.join(',')}"
           data-mp-cost="${mpCost}"
           title="${tooltip}">
        ${SET_NAMES[set.type]}
        <span class="mp-cost">${mpCost} MP</span>
      </div>
    `;
  }).join('');
  
  // Add event handlers
  infoBar.querySelectorAll('.fu-set-indicator').forEach(indicator => {
    // Click handler for all indicators (even disabled ones show feedback)
    indicator.addEventListener('click', () => clickHandler(indicator));
    
    // Hover handlers for highlighting
    indicator.addEventListener('mouseenter', () => {
      highlightSetCards(indicator);
    });
    
    indicator.addEventListener('mouseleave', () => {
      clearHighlights();
    });
  });
}

// Update table set display with player grouping
function updateTableSetDisplay(cards, infoBar, clickHandler) {
  // Group cards by owner
  const cardsByPlayer = {};
  
  for (const card of cards) {
    const ownerId = card.getFlag(MODULE_ID, 'ownerId');
    if (!ownerId) continue;
    
    if (!cardsByPlayer[ownerId]) cardsByPlayer[ownerId] = [];
    cardsByPlayer[ownerId].push(card);
  }
  
  // Detect sets for each player
  const setIndicators = [];
  
  for (const [playerId, playerCards] of Object.entries(cardsByPlayer)) {
    const sets = detectFabulaUltimaSets(playerCards);
    const playerName = game.users.get(playerId)?.name || 'Unknown';
    
    sets.forEach(set => {
      const isOwnSet = playerId === game.userId;
      const className = `fu-set-indicator ${set.type} ${isOwnSet ? 'own-set' : 'other-set'}`;
      
      setIndicators.push(`
        <div class="${className}" 
             style="--set-color: ${getSetColor(set.type)}"
             data-set-type="${set.type}"
             data-card-ids="${set.cardIds.join(',')}"
             data-player-id="${playerId}">
          <span class="set-name">${SET_NAMES[set.type]}</span>
          <span class="player-name">${playerName}</span>
        </div>
      `);
    });
  }
  
  if (setIndicators.length === 0) {
    infoBar.classList.remove('has-sets');
    infoBar.innerHTML = '';
    return;
  }
  
  infoBar.classList.add('has-sets');
  infoBar.innerHTML = setIndicators.join('');
  
  // Add event handlers
  infoBar.querySelectorAll('.fu-set-indicator').forEach(indicator => {
    indicator.addEventListener('click', () => clickHandler(indicator));
    
    // Hover handlers for highlighting
    indicator.addEventListener('mouseenter', () => {
      highlightSetCards(indicator);
    });
    
    indicator.addEventListener('mouseleave', () => {
      clearHighlights();
    });
  });
}

// Highlight specific set cards on hover
function highlightSetCards(indicator) {
  const cardIds = indicator.dataset.cardIds.split(',');
  const setType = indicator.dataset.setType;
  const containerType = indicator.closest('#fu-hand-area') ? 'hand' : 'table';
  
  // Clear previous highlights first
  clearHighlights();
  
  // Highlight the specific cards for this set
  cardIds.forEach(cardId => {
    const cardElement = document.querySelector(`#fu-${containerType}-cards [data-card-id="${cardId}"]`);
    if (cardElement) {
      cardElement.classList.add('fu-valid-set', `fu-hand-${setType}`);
      cardElement.style.setProperty('--hand-color', getSetColor(setType));
    }
  });
}

// Clear all highlights
export function clearHighlights() {
  document.querySelectorAll('.fu-card').forEach(card => {
    card.classList.remove('fu-valid-set', 'fu-partial-set');
    Object.keys(SET_NAMES).forEach(setType => {
      card.classList.remove(`fu-hand-${setType}`);
    });
    card.style.removeProperty('--hand-color');
  });
}

// Show tooltip on hover - Better version with context
export function showSetTooltip(indicator, containerType = null) {
  // Remove any existing tooltips
  document.querySelectorAll('.fu-set-tooltip').forEach(t => t.remove());
  
  const setType = indicator.dataset.setType;
  const cardIds = indicator.dataset.cardIds.split(',');
  
  // Determine container type if not provided
  if (!containerType) {
    containerType = indicator.closest('#fu-hand-area') ? 'hand' : 'table';
  }
  
  let cards = [];
  
  if (containerType === 'hand') {
    // For hand, we need to find the player's hand pile
    // This assumes you have access to the playerDecks object from main.js
    // You might need to expose it globally or pass it differently
    const userId = game.userId;
    const playerHand = game.cards.find(c => 
      (c.type === "hand" || c.type === "pile") && 
      c.name.includes(game.users.get(userId).name) && 
      c.name.toLowerCase().includes('hand')
    );
    
    if (playerHand) {
      cards = cardIds.map(id => playerHand.cards.get(id)).filter(Boolean);
    }
  } else if (containerType === 'table') {
    // For table, get cards from the table pile
    const tablePile = game.cards.getName('Table');
    if (tablePile) {
      cards = cardIds.map(id => tablePile.cards.get(id)).filter(Boolean);
    }
  }
  
  if (cards.length === 0) {
    console.warn('Could not find cards for tooltip:', cardIds, 'in', containerType);
    return;
  }
  
  // Create set data with calculations
  const setData = {
    type: setType,
    cards: cards,
    cardIds: cardIds,
    values: cards.map(c => getCardValue(c))
  };
  
  // Add specific data for certain sets
  if (setType === 'forbidden-monarch' || setType === 'jackpot') {
    setData.value = setData.values[0]; // Common value
  }
  
  const tooltip = createSetTooltip(setData);
  document.body.appendChild(tooltip);
  
  // Position tooltip above the indicator
  const rect = indicator.getBoundingClientRect();
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 10}px`;
  tooltip.style.transform = 'translate(-50%, -100%)';
  
  // Store reference for removal
  indicator._tooltip = tooltip;
}

// Hide tooltip
export function hideSetTooltip(indicator) {
  if (indicator._tooltip) {
    indicator._tooltip.remove();
    indicator._tooltip = null;
  }
  clearHighlights(); // Also clear highlights when hiding tooltip
}

// Calculate MP cost for a set
export function calculateMPCost(setData) {
  // Magic Cards skill: spend 5 MP per card in the set
  const cardsInSet = setData.cards.length;
  return cardsInSet * 5;
}

// Check if player can afford the MP cost
export function canAffordMP(cost) {
  const actor = game.user.character;
  if (!actor) return false;
  
  // Get current MP (this depends on the FU system implementation)
  const currentMP = actor.system.resources?.mp?.value || 0;
  return currentMP >= cost;
}

// Get player's skill level for max MP spending
export function getMaxMPSpend() {
  const actor = game.user.character;
  if (!actor) return 10; // Base minimum
  
  // Find Magic Cards skill level (depends on FU system)
  const skillLevel = actor.items
    .find(i => i.name === "Magic Cards")
    ?.system?.level || 0;
  
  return 10 + (skillLevel * 5);
}

// Highlight cards in valid sets
export function highlightValidSets(cards, container) {
  if (!game.settings.get(MODULE_ID, SETTINGS_KEYS.HIGHLIGHT_VALID_SETS)) return;
  
  // Clear previous highlights
  container.querySelectorAll('.fu-card').forEach(card => {
    card.classList.remove('fu-valid-set', 'fu-partial-set');
    Object.keys(SET_NAMES).forEach(setType => {
      card.classList.remove(`fu-hand-${setType}`);
    });
  });
  
  const detectedSets = detectFabulaUltimaSets(cards);
  
  // Apply highlights
  detectedSets.forEach(set => {
    set.cards.forEach(card => {
      const cardElement = container.querySelector(`[data-card-id="${card.id}"]`);
      if (cardElement) {
        cardElement.classList.add('fu-valid-set', `fu-hand-${set.type}`);
        cardElement.style.setProperty('--hand-color', getSetColor(set.type));
      }
    });
  });
  
  // Highlight partial sets if enabled
  if (game.settings.get(MODULE_ID, SETTINGS_KEYS.SHOW_PARTIAL_SETS)) {
    highlightPartialSets(cards, container);
  }
}

// Highlight partial sets (incomplete sets that could be completed)
function highlightPartialSets(cards, container) {
  // This is a simplified version - you could expand this
  const cardArray = Array.from(cards);
  
  // Check for partial sets (e.g., 3 of a kind that could become jackpot)
  const valueGroups = cardArray.reduce((groups, card) => {
    const value = card.name.match(/\d+/)?.[0] || 'other';
    if (!groups[value]) groups[value] = [];
    groups[value].push(card);
    return groups;
  }, {});
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length === 3) {
      // Potential jackpot
      group.forEach(card => {
        const cardElement = container.querySelector(`[data-card-id="${card.id}"]`);
        if (cardElement && !cardElement.classList.contains('fu-valid-set')) {
          cardElement.classList.add('fu-partial-set');
        }
      });
    }
  }
}

// Create rich set tooltip
export function createSetTooltip(setData) {
  const description = getSetEffectDescription(setData);
  const mpCost = calculateMPCost(setData);
  const canAfford = canAffordMP(mpCost);
  
  const tooltip = document.createElement('div');
  tooltip.className = 'fu-set-tooltip';
  tooltip.style.setProperty('--set-color', getSetColor(setData.type));
  
  tooltip.innerHTML = `
    <div class="tooltip-header">
      <span class="set-name">${SET_NAMES[setData.type]}</span>
      <span class="mp-cost ${canAfford ? '' : 'insufficient'}">${mpCost} MP</span>
    </div>
    <div class="tooltip-requirements">
      <strong>Requirements:</strong> ${description.base}
    </div>
    <div class="tooltip-cards">
      <strong>Your cards:</strong> ${description.cards}
    </div>
    <div class="tooltip-effect">
      <strong>Effect:</strong> ${description.effect}
    </div>
    ${!canAfford ? '<div class="tooltip-warning">⚡ Insufficient MP</div>' : ''}
    <div class="tooltip-hint">Click to play to table</div>
  `;
  
  return tooltip;
}

// Get card value from card data
export function getCardValue(card) {
  // Try to get value from card data, flags, or name
  return card.value || card.getFlag(MODULE_ID, 'value') || 
         parseInt(card.name.match(/\d+/)?.[0]) || 0;
}

// Get detailed effect description with calculated values
export function getSetEffectDescription(setData) {
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

  const template = SET_DESCRIPTIONS[setData.type];
  if (!template) return { base: 'Unknown set', effect: 'Unknown effect', cards: '' };

  // Calculate specific values for this set
  let effect = template.effect;
  
  // Replace placeholders with calculated values
  switch (setData.type) {
    case 'magic-flush':
      const magicDamage = 25 + setData.values.reduce((a, b) => a + b, 0);
      effect = effect.replace('【25 + the total value of the resolved cards】', `【${magicDamage}】`);
      break;
      
    case 'blinding-flush':
      const blindingDamage = 15 + setData.values.reduce((a, b) => a + b, 0);
      const highestValue = Math.max(...setData.values);
      const damageType = highestValue % 2 === 0 ? 'light' : 'dark';
      effect = effect.replace('【15 + the total value of the resolved cards】', `【${blindingDamage}】`);
      effect = effect.replace('light if the highest value among those cards is even, or dark if that value is odd', 
                              `${damageType} (highest value: ${highestValue})`);
      break;
      
    case 'full-status':
      const fullHighest = Math.max(...setData.values);
      const statusEffect = fullHighest % 2 === 0 ? 'recover from' : 'suffer';
      effect = effect.replace('【the highest value among resolved cards】', `【${fullHighest}】`);
      effect = effect.replace('if even, you and every ally present on the scene recover from the chosen status effects; if odd, each enemy present on the scene suffers them',
                              `allies will ${statusEffect} the chosen status effects`);
      break;
      
    case 'triple-support':
      const totalValue = setData.values.reduce((a, b) => a + b, 0);
      const healAmount = totalValue * 3;
      effect = effect.replace('【the total value of the resolved cards, multiplied by 3】', `【${healAmount}】`);
      break;
      
    case 'double-trouble':
      const doubleDamage = 10 + Math.max(...setData.values);
      effect = effect.replace('【10 + the highest value among resolved cards】', `【${doubleDamage}】`);
      break;
      
    case 'forbidden-monarch':
      const commonValue = setData.value;
      const forbiddenType = commonValue % 2 === 0 ? 'light' : 'dark';
      effect = effect.replace('【the common value of the 4 cards】', `【${commonValue}】`);
      effect = effect.replace('light if 【the common value of the 4 cards】 is even, or dark if that total is odd',
                              `${forbiddenType} damage`);
      break;
  }
  
  return {
    base: template.base,
    effect: effect,
    cards: setData.cards.map(c => c.name).join(', ')
  };
}