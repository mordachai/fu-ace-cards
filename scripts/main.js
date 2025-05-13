// scripts/main.js
import { MODULE_ID } from './settings.js';
import { HooksManager } from './hooks-manager.js';

// Initialize the module
console.log(`${MODULE_ID} | Loading Ace of Cards module`);

// Register all hooks - this will orchestrate the rest of the initialization
HooksManager.register();

// Export the global window.capitalize function for templates
window.capitalize = function(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
};