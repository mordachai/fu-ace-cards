// scripts/main.js
import { MODULE_ID } from './settings.js';
import { HooksManager } from './hooks-manager.js';

// Initialize the module
console.log(`${MODULE_ID} | Loading Ace of Cards module`);

// Register all hooks - this will orchestrate the rest of the initialization
HooksManager.register();

// Register Handlebars helpers
Handlebars.registerHelper('capitalize', function(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
});

// Add subtract helper for healing allocation
Handlebars.registerHelper('subtract', function(a, b) {
  return Math.max(0, a - b);
});

// Export the global window.capitalize function for templates
window.capitalize = function(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
};