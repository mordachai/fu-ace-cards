// scripts/set-detector.js
import { SETTINGS_KEYS } from './settings.js';

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
  
  // Convert cards to analyzable format
  const analyzableCards = cardArray.map(card => ({
    id: card.id,
    value: getCardValue(card),
    suit: getCardSuit(card),
    isJoker: isJoker(card),
    card: card
  }));
  
  // Sort by value for easier analysis
  analyzableCards.sort((a, b) => a.value - b.value);
  
  // Check for each set type
  const jackpot = findJackpot(analyzableCards);
  if (jackpot) sets.push(jackpot);
  
  const magicFlush = findMagicFlush(analyzableCards);
  if (magicFlush) sets.push(magicFlush);
  
  const blindingFlush = findBlindingFlush(analyzableCards);
  if (blindingFlush) sets.push(blindingFlush);
  
  const fullStatus = findFullStatus(analyzableCards);
  if (fullStatus) sets.push(fullStatus);
  
  const tripleSupport = findTripleSupport(analyzableCards);
  if (tripleSupport) sets.push(tripleSupport);
  
  const doubleTrouble = findDoubleTrouble(analyzableCards);
  if (doubleTrouble) sets.push(doubleTrouble);
  
  const magicPair = findMagicPair(analyzableCards);
  if (magicPair) sets.push(magicPair);
  
  // Check for forbidden monarch if heroic skill is available
  const forbiddenMonarch = findForbiddenMonarch(analyzableCards);
  if (forbiddenMonarch) sets.push(forbiddenMonarch);
  
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

// Find Triple Support: 3 cards of same value
function findTripleSupport(cards) {
  const valueGroups = groupByValue(cards);
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length >= 3) {
      const threeCards = group.slice(0, 3);
      return {
        type: 'triple-support',
        cards: threeCards.map(c => c.card),
        cardIds: threeCards.map(c => c.id),
        value: parseInt(value),
        values: threeCards.map(c => c.value)
      };
    }
  }
  return null;
}

// Find Double Trouble: 2 pairs
function findDoubleTrouble(cards) {
  const valueGroups = groupByValue(cards);
  const pairs = [];
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length >= 2) {
      pairs.push({ value: parseInt(value), cards: group.slice(0, 2) });
    }
  }
  
  if (pairs.length >= 2) {
    const selectedPairs = pairs.slice(0, 2);
    const allCards = [...selectedPairs[0].cards, ...selectedPairs[1].cards];
    return {
      type: 'double-trouble',
      cards: allCards.map(c => c.card),
      cardIds: allCards.map(c => c.id),
      values: allCards.map(c => c.value),
      pairValues: selectedPairs.map(p => p.value)
    };
  }
  return null;
}

// Find Magic Pair: 2 cards of same value
function findMagicPair(cards) {
  const valueGroups = groupByValue(cards);
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length >= 2) {
      const twoCards = group.slice(0, 2);
      return {
        type: 'magic-pair',
        cards: twoCards.map(c => c.card),
        cardIds: twoCards.map(c => c.id),
        value: parseInt(value),
        values: twoCards.map(c => c.value)
      };
    }
  }
  return null;
}

// Find Forbidden Monarch: 4 of same value + 1 joker
function findForbiddenMonarch(cards) {
  // Check if player has the Forbidden Rite heroic skill
  // This would need to be implemented based on your character system
  
  const jokers = cards.filter(c => c.isJoker);
  const nonJokers = cards.filter(c => !c.isJoker);
  
  if (jokers.length === 0) return null;
  
  const valueGroups = groupByValue(nonJokers);
  
  for (const [value, group] of Object.entries(valueGroups)) {
    if (group.length === 4) {
      const allCards = [...group, jokers[0]];
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
    if (card.isJoker) return groups; // Skip jokers
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