// scripts/settings.js
export const MODULE_ID = 'fu-ace-cards';

export const SETTINGS_KEYS = {
  // Visual settings
  SHOW_PLAYER_COLORS: 'showPlayerColors',
  SHOW_TOOLTIPS: 'showTooltips',
  HIGHLIGHT_VALID_SETS: 'highlightValidSets',
  SHOW_SET_NAMES: 'showSetNames',
  SET_INFO_STYLE: 'setInfoStyle',
  SHOW_PARTIAL_SETS: 'showPartialSets',
  ALLOW_CARD_DISCARD: 'allowCardDiscard',
  
  // Color settings
  SET_COLORS: {
    JACKPOT: '#FFD700',
    MAGIC_FLUSH: '#9370DB',
    BLINDING_FLUSH: '#87CEEB',
    FULL_STATUS: '#32CD32',
    TRIPLE_SUPPORT: '#00FA9A',
    DOUBLE_TROUBLE: '#FF6347',
    MAGIC_PAIR: '#DDA0DD',
    FORBIDDEN_MONARCH: '#8B0000'
  }
};

export function registerSettings() {
  // Visual Settings
  game.settings.register(MODULE_ID, SETTINGS_KEYS.SHOW_PLAYER_COLORS, {
    name: 'Show Player Colors',
    hint: 'Display colored borders on cards to indicate ownership',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS_KEYS.SHOW_TOOLTIPS, {
    name: 'Show Card Tooltips',
    hint: 'Display card names and owner information on hover',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS_KEYS.HIGHLIGHT_VALID_SETS, {
    name: 'Highlight Valid Sets',
    hint: 'Visually highlight cards that form valid Fabula Ultima sets',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS_KEYS.SHOW_SET_NAMES, {
    name: 'Show Set Names',
    hint: 'Display names of detected sets in info bar',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS_KEYS.SET_INFO_STYLE, {
    name: 'Set Info Display Style',
    hint: 'How detected sets are displayed',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      'bar': 'Info Bar',
      'minimal': 'Minimal Text',
      'slide': 'Slide on Hover',
      'none': 'Disabled'
    },
    default: 'bar'
  });

  game.settings.register(MODULE_ID, SETTINGS_KEYS.SHOW_PARTIAL_SETS, {
    name: 'Show Partial Sets',
    hint: 'Display indicators for incomplete sets (experimental)',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS_KEYS.ALLOW_CARD_DISCARD, {
    name: 'Allow Card Discard',
    hint: 'Allow players to discard cards at any time (not rules-as-written)',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });
}