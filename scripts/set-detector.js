// scripts/set-detector.js
import { SETTINGS_KEYS } from './settings.js';
import { MODULE_ID } from './settings.js';

// Set name mappings
export const SET_NAMES = {
  'jackpot': 'Jackpot',
  'magic-flush': 'Magic Flush',
  'blinding-flush': 'Blinding Flush',
  'full-status': 'Full Status',
  'triple-support': 'Triple Support',
  'double-trouble': 'Double Trouble',
  'magic-pair': 'Magic Pair',
  'forbidden-monarch': 'Forbidden Monarch'
};

// Parse card value from card data
export function getCardValue(card) {
  // Try to get value from card data, flags, or name
  return card.value || card.getFlag('fu-ace-cards', 'value') || 
         parseInt(card.name.match(/\d+/)?.[0]) || 0;
}

// Parse card suit from card data
function getCardSuit(card) {
  // Try to get suit from card data, flags, or name
  return card.suit || card.getFlag('fu-ace-cards', 'suit') || 
         card.name.toLowerCase().match(/(clubs?|diamonds?|hearts?|spades?)/)?.[0] || '';
}

// Check if card is a joker
function isJoker(card) {
  return card.name.toLowerCase().includes('joker') || 
         card.getFlag('fu-ace-cards', 'isJoker');
}

// Detect all valid sets in a collection of cards
export function detectFabulaUltimaSets(cards) {
  const sets = [];
  const cardArray = Array.from(cards);
  
  // Convert cards to analyzable format with special handling for jokers
  const analyzableCards = cardArray.map(card => {
    // Check if this is a joker
    const isJokerCard = isJoker(card);
    
    if (isJokerCard) {
      // Get phantom values if assigned
      const phantomSuit = card.getFlag(MODULE_ID, 'phantomSuit');
      const phantomValue = card.getFlag(MODULE_ID, 'phantomValue');
      
      return {
        id: card.id,
        value: phantomValue ? parseInt(phantomValue) : 0,
        suit: phantomSuit || '',
        isJoker: true,
        hasPhantomValues: !!(phantomSuit && phantomValue),
        originalValue: getCardValue(card), // Keep track of original value
        originalSuit: getCardSuit(card),   // Keep track of original suit
        card: card
      };
    }
    
    // Regular card handling
    return {
      id: card.id,
      value: getCardValue(card),
      suit: getCardSuit(card),
      isJoker: false,
      card: card
    };
  });
  
  // Create separate arrays for analysis
  // 1. All cards including jokers with their phantom values (for most set detection)
  const allCards = [...analyzableCards];
  
  // 2. Non-joker cards only (for sets that explicitly exclude jokers like Jackpot)
  const nonJokers = analyzableCards.filter(c => !c.isJoker);
  
  // 3. Jokers only (for sets requiring jokers like Forbidden Monarch)
  const jokers = analyzableCards.filter(c => c.isJoker);
  
  // 4. Valid jokers with assigned values
  const validJokers = jokers.filter(c => c.hasPhantomValues);
  
  // 5. All valid cards (non-jokers + jokers with assigned values)
  const validCards = [...nonJokers, ...validJokers];
  
  // Sort by value for easier analysis
  validCards.sort((a, b) => a.value - b.value);

  // Forbidden Monarch: 4 cards of same value (no jokers) + 1 joker
  // Special case: Need to use both nonJokers and jokers separately
  const forbiddenMonarch = findForbiddenMonarch(nonJokers, jokers);
  if (forbiddenMonarch) sets.push(forbiddenMonarch);
  
  // Jackpot: Must be 4 cards of same value, none of which is a joker
  const jackpot = findJackpot(nonJokers);  // Explicitly use non-jokers
  if (jackpot) sets.push(jackpot);
  
  // Magic Flush: 4 cards of consecutive values and same suit
  // Can include jokers with their phantom values
  const magicFlush = findMagicFlush(validCards);
  if (magicFlush) sets.push(magicFlush);
  
  // Blinding Flush: 4 cards of consecutive values (any suits)
  // Can include jokers with their phantom values
  const blindingFlush = findBlindingFlush(validCards);
  if (blindingFlush) sets.push(blindingFlush);
  
  // Full Status: 3 cards of same value + 2 cards of same value
  // Can include jokers with their phantom values
  const fullStatus = findFullStatus(validCards);
  if (fullStatus) sets.push(fullStatus);
  
  // Triple Support: 3 cards of same value
  // Can include jokers with their phantom values
  const tripleSupports = findTripleSupport(validCards);
  sets.push(...tripleSupports);
  
  // Double Trouble: 2 cards of same value + 2 cards of same value
  // Can include jokers with their phantom values
  const doubleTroubles = findDoubleTrouble(validCards);
  sets.push(...doubleTroubles);
  
  // Magic Pair: 2 cards of same value
  // Can include jokers with their phantom values
  const magicPairs = findMagicPair(validCards);
  sets.push(...magicPairs);
  
  // Post-processing: For sets with jokers, mark them in the set data
  for (const set of sets) {
    set.includesJokers = set.cards.some(card => 
      card.name.toLowerCase().includes('joker') || card.getFlag(MODULE_ID, 'isJoker')
    );
    
    // Add info about which jokers and their phantom values
    if (set.includesJokers) {
      set.jokerInfo = set.cards
        .filter(card => card.name.toLowerCase().includes('joker') || card.getFlag(MODULE_ID, 'isJoker'))
        .map(joker => ({
          id: joker.id,
          phantomSuit: joker.getFlag(MODULE_ID, 'phantomSuit'),
          phantomValue: joker.getFlag(MODULE_ID, 'phantomValue')
        }));
    }
  }
  
  return sets;
}

// Find Jackpot: 4 cards of same value, no jokers
function findJackpot(cards) {
  const nonJokers = cards.filter(c => !c.isJoker);
  const valueGroups = groupByValue(nonJokers);
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length === 4) {
      return {
        type: 'jackpot',
        cards: group.map(c => c.card),
        cardIds: group.map(c => c.id),
        value: parseInt(value),
        values: group.map(c => c.value)
      };
    }
  }
  return null;
}

// Find Magic Flush: 4 consecutive values of same suit
function findMagicFlush(cards) {
  const bySuit = groupBySuit(cards);
  
  for (const [suit, suitCards] of Object.entries(bySuit)) {
    if (suitCards.length >= 4) {
      const consecutive = findConsecutiveCards(suitCards, 4);
      if (consecutive) {
        return {
          type: 'magic-flush',
          cards: consecutive.map(c => c.card),
          cardIds: consecutive.map(c => c.id),
          suit: suit,
          values: consecutive.map(c => c.value)
        };
      }
    }
  }
  return null;
}

// Find Blinding Flush: 4 consecutive values (any suits)
function findBlindingFlush(cards) {
  const consecutive = findConsecutiveCards(cards, 4);
  if (consecutive) {
    return {
      type: 'blinding-flush',
      cards: consecutive.map(c => c.card),
      cardIds: consecutive.map(c => c.id),
      values: consecutive.map(c => c.value)
    };
  }
  return null;
}

// Find Full Status: 3 of a kind + pair
function findFullStatus(cards) {
  const valueGroups = groupByValue(cards);
  let triple = null;
  let pair = null;
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length >= 3 && !triple) {
      triple = { value: parseInt(value), cards: group.slice(0, 3) };
    } else if (group.length >= 2 && !pair && (!triple || parseInt(value) !== triple.value)) {
      pair = { value: parseInt(value), cards: group.slice(0, 2) };
    }
    
    if (triple && pair) {
      const allCards = [...triple.cards, ...pair.cards];
      return {
        type: 'full-status',
        cards: allCards.map(c => c.card),
        cardIds: allCards.map(c => c.id),
        tripleValue: triple.value,
        pairValue: pair.value,
        values: allCards.map(c => c.value)
      };
    }
  }
  return null;
}

// Find ALL Magic Pairs: 2 cards of same value
function findMagicPair(cards) {
  const valueGroups = groupByValue(cards);
  const pairs = [];
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length >= 2) {
      // For each pair, create a separate set
      for (let i = 0; i < group.length - 1; i += 2) {
        if (i + 1 < group.length) {
          const twoCards = group.slice(i, i + 2);
          pairs.push({
            type: 'magic-pair',
            cards: twoCards.map(c => c.card),
            cardIds: twoCards.map(c => c.id),
            value: parseInt(value),
            values: twoCards.map(c => c.value)
          });
        }
      }
    }
  }
  
  return pairs;
}

// Find ALL Triple Supports: 3 cards of same value
function findTripleSupport(cards) {
  const valueGroups = groupByValue(cards);
  const triples = [];
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length >= 3) {
      // For each triple, create a separate set
      for (let i = 0; i <= group.length - 3; i += 3) {
        if (i + 2 < group.length) {
          const threeCards = group.slice(i, i + 3);
          triples.push({
            type: 'triple-support',
            cards: threeCards.map(c => c.card),
            cardIds: threeCards.map(c => c.id),
            value: parseInt(value),
            values: threeCards.map(c => c.value)
          });
        }
      }
    }
  }
  
  return triples;
}

// Find ALL Double Troubles: 2 pairs (checking all combinations)
function findDoubleTrouble(cards) {
  const valueGroups = groupByValue(cards);
  const pairGroups = [];
  const doubleTroubles = [];
  
  // First, collect all possible pairs
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length >= 2) {
      for (let i = 0; i <= group.length - 2; i += 2) {
        if (i + 1 < group.length) {
          pairGroups.push({ 
            value: parseInt(value), 
            cards: group.slice(i, i + 2) 
          });
        }
      }
    }
  }
  
  // Now find all combinations of two different pairs
  for (let i = 0; i < pairGroups.length; i++) {
    for (let j = i + 1; j < pairGroups.length; j++) {
      const pair1 = pairGroups[i];
      const pair2 = pairGroups[j];
      
      // Make sure they're different values
      if (pair1.value !== pair2.value) {
        const allCards = [...pair1.cards, ...pair2.cards];
        doubleTroubles.push({
          type: 'double-trouble',
          cards: allCards.map(c => c.card),
          cardIds: allCards.map(c => c.id),
          values: allCards.map(c => c.value),
          pairValues: [pair1.value, pair2.value]
        });
      }
    }
  }
  
  return doubleTroubles;
}

function findForbiddenMonarch(nonJokers, jokers) {
  // If jokers array isn't provided (backward compatibility), 
  // extract jokers from cards if provided as a single array
  if (!jokers && Array.isArray(nonJokers)) {
    // This is the old signature, extract jokers from the array
    const cards = nonJokers;
    jokers = cards.filter(c => c.isJoker);
    nonJokers = cards.filter(c => !c.isJoker);
  }
  
  // Need at least one joker
  if (!jokers || jokers.length === 0) return null;
  
  const valueGroups = groupByValue(nonJokers);
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length === 4) {
      // Use any joker (doesn't matter which one for Forbidden Monarch)
      const joker = jokers[0];
      const allCards = [...group, joker];
      
      return {
        type: 'forbidden-monarch',
        cards: allCards.map(c => c.card),
        cardIds: allCards.map(c => c.id),
        value: parseInt(value),
        values: group.map(c => c.value)
      };
    }
  }
  return null;
}

// Helper functions
function groupByValue(cards) {
  return cards.reduce((groups, card) => {
    const value = card.value;
    if (!groups[value]) groups[value] = [];
    groups[value].push(card);
    return groups;
  }, {});
}

function groupBySuit(cards) {
  return cards.reduce((groups, card) => {
    if (!card.suit && !card.value) return groups; // Skip unassigned jokers
    const suit = card.suit;
    if (!groups[suit]) groups[suit] = [];
    groups[suit].push(card);
    return groups;
  }, {});
}

function findConsecutiveCards(cards, length) {
  if (cards.length < length) return null;
  
  for (let i = 0; i <= cards.length - length; i++) {
    let consecutive = [cards[i]];
    let expectedNext = cards[i].value + 1;
    
    for (let j = i + 1; j < cards.length && consecutive.length < length; j++) {
      if (cards[j].value === expectedNext) {
        consecutive.push(cards[j]);
        expectedNext++;
      }
    }
    
    if (consecutive.length === length) {
      return consecutive;
    }
  }
  return null;
}

// Get color for a set type
export function getSetColor(setType) {
  const colors = SETTINGS_KEYS.SET_COLORS;
  return colors[setType.toUpperCase().replace('-', '_')] || '#FFFFFF';
}