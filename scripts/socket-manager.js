// scripts/socket-manager.js
import { MODULE_ID } from './settings.js';

// Create a minimal InlineSourceInfo compatible class to work with Fabula Ultima's pipeline
class MinimalSourceInfo {
  constructor(name, actorUuid, itemUuid) {
    this.name = name || "Card Effect";
    this.actorUuid = actorUuid;
    this.itemUuid = itemUuid;
  }

  resolveItem() {
    if (!this.itemUuid) return null;
    try {
      return fromUuidSync(this.itemUuid);
    } catch (error) {
      console.error("Error resolving item:", error);
      return null;
    }
  }

  resolveActor() {
    if (!this.actorUuid) return null;
    try {
      return fromUuidSync(this.actorUuid);
    } catch (error) {
      console.error("Error resolving actor:", error);
      return null;
    }
  }
}

export class SocketManager {
  
  // Initialize socket listeners
  static initialize() {
    // Remove any existing listeners to avoid duplicates
    if (game.socket) {
      console.log(`${MODULE_ID} | Removing existing socket listeners`);
      game.socket.off(`module.${MODULE_ID}`);
      
      // Add new listener
      console.log(`${MODULE_ID} | Adding socket listener for ${MODULE_ID}`);
      game.socket.on(`module.${MODULE_ID}`, this.handleSocketMessage.bind(this));
      
      console.log(`${MODULE_ID} | Socket initialized, user is ${game.user.isGM ? 'GM' : 'player'}`);
    } else {
      console.error(`${MODULE_ID} | Game socket not available`);
    }
  }
  
  // Handle incoming socket messages
  static handleSocketMessage(msg) {
  console.log(`${MODULE_ID} | Socket message received:`, msg);
  
  // Special handling for confirmations (don't ignore our own messages)
  if (msg.senderId === game.userId && 
      !['healingConfirm', 'statusConfirm'].includes(msg.action)) {
    console.log(`${MODULE_ID} | Ignoring own message:`, msg.action);
    return; // Ignore own non-confirmation messages
  }
  
  // Clean up tooltips on all socket messages
  if (window.FuAceCards?.UIManager) {
    window.FuAceCards.UIManager.cleanupAllTooltips();
  }
  
  switch (msg.action) {
    case 'cardToTable':
      console.log(`${MODULE_ID} | Processing cardToTable socket message`);
      this.handleCardToTable(msg);
      break;
      
    case 'cleanTable':
      console.log(`${MODULE_ID} | Processing cleanTable socket message`);
      this.handleCleanTable(msg);
      break;
      
    case 'setPlayed':
      console.log(`${MODULE_ID} | Processing setPlayed socket message`);
      this.handleSetPlayed(msg);
      break;
      
    case 'setActivated':
      console.log(`${MODULE_ID} | Processing setActivated socket message`);
      this.handleSetActivated(msg);
      break;

    case 'applyHealing':
      console.log(`${MODULE_ID} | Processing applyHealing socket message`);
      this.handleApplyHealing(msg);
      break;
    
    case 'healingConfirm':
      console.log(`${MODULE_ID} | Processing healingConfirm socket message`);
      this.handleHealingConfirm(msg);
      break;
    
    case 'applyStatusEffect':
      console.log(`${MODULE_ID} | Processing applyStatusEffect socket message`);
      this.handleApplyStatusEffect(msg);
      break;
      
    case 'statusConfirm':
      console.log(`${MODULE_ID} | Processing statusConfirm socket message`);
      this.handleStatusConfirm(msg);
      break;

    case 'applyDamage':
      console.log(`${MODULE_ID} | Processing applyDamage socket message`);
      this.handleApplyDamage(msg);
      break;

    case 'damageConfirm':
      console.log(`${MODULE_ID} | Processing damageConfirm socket message`);
      this.handleDamageConfirm(msg);
      break;

    case 'returnCardToHand':
      console.log(`${MODULE_ID} | Processing returnCardToHand socket message`);
      this.handleCardReturnedToHand(msg);
      break;
      
    case 'shuffleDeck':
      console.log(`${MODULE_ID} | Processing shuffleDeck socket message`);
      this.handleShuffleDeck(msg);
      break;
      
    default:
      console.warn(`${MODULE_ID} | Unknown socket action:`, msg.action);
    }
  }

  static handleCardReturnedToHand(msg) {
    // Update table view for all players
    if (window.FuAceCards?.UIManager) {
      window.FuAceCards.UIManager.renderTable();
    }
  }
  
  // Handle a card being played to the table
  static handleCardToTable(msg) {
    // Validate that the card actually was moved to the table
    const tablePile = window.FuAceCards?.getTablePile();
    if (!tablePile) return;
    
    const tableCard = tablePile.cards.get(msg.cardId);
    if (tableCard) {
      if (window.FuAceCards?.UIManager) {
        window.FuAceCards.UIManager.renderTable();
      }
    }
  }
  
  // Handle the table being cleaned
  static handleCleanTable(msg) {
    // Another player cleaned the table, update our view
    if (window.FuAceCards?.UIManager) {
      window.FuAceCards.UIManager.renderTable();
    }
  }
  
  // Handle a set being played
  static handleSetPlayed(msg) {
    // Another player played a set, update our view
    if (window.FuAceCards?.UIManager) {
      window.FuAceCards.UIManager.renderTable();
    }
  }
  
  // Handle a set being activated
  static handleSetActivated(msg) {
    // Another player activated a set and discarded the cards, update our view
    if (window.FuAceCards?.UIManager) {
      window.FuAceCards.UIManager.renderTable();
    }
  }

  static async handleApplyDamage(msg) {
    // Only GM should process this
    if (!game.user.isGM) return;
    
    const { targetId, finalDamage, damageType, sourceActorId } = msg;
    
    // Find the target token/actor
    let token = canvas.tokens.placeables.find(t => t.id === targetId);
    let actor = token?.actor;
    
    // If not found as token, try as actor ID
    if (!actor) {
      actor = game.actors.get(targetId);
      if (actor) {
        token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
      }
    }
    
    if (!actor) {
      console.error(`${MODULE_ID} | Cannot find target for damage: ${targetId}`);
      return;
    }
    
    try {
      // Create a proper source object for the system
      const sourceActor = sourceActorId ? game.actors.get(sourceActorId) : null;
      const sourceInfo = new MinimalSourceInfo(
        sourceActor?.name || "Card Effect",
        sourceActor?.uuid || null,
        null
      );
      
      // Apply damage using system method if available
      if (game.projectfu && typeof game.projectfu.applyDamage === 'function') {
        try {
          await game.projectfu.applyDamage(
            damageType, 
            Math.abs(finalDamage), 
            sourceInfo, 
            [actor], 
            []
          );
          // Success, send confirmation
          this.emitDamageConfirm(targetId, finalDamage, damageType, msg.senderId);
          return;
        } catch (error) {
          console.warn("System damage application failed, falling back to manual method:", error);
        }
      }
      
      // Apply damage manually
      const hpValue = actor.system.resources.hp.value;
      const hpMax = actor.system.resources.hp.max;
      
      if (finalDamage < 0) {
        // Healing (absorption)
        actor.update({
          "system.resources.hp.value": Math.min(hpValue - finalDamage, hpMax)
        });
        
        // Show floating text
        if (token) {
          canvas.interface.createScrollingText(token.center, `+${Math.abs(finalDamage)}`, {
            fontSize: 24,
            fill: "#00ff00",
            stroke: 0x000000,
            strokeThickness: 4
          });
        }
      } else {
        // Damage
        actor.update({
          "system.resources.hp.value": Math.max(hpValue - finalDamage, 0)
        });
        
        // Show floating text
        if (token) {
          canvas.interface.createScrollingText(token.center, `-${finalDamage}`, {
            fontSize: 24,
            fill: "#ff0000",
            stroke: 0x000000,
            strokeThickness: 4
          });
        }
      }
      
      // Send confirmation
      this.emitDamageConfirm(targetId, finalDamage, damageType, msg.senderId);
      
    } catch (error) {
      console.error(`${MODULE_ID} | Error applying damage via socket:`, error);
    }
  }

  // Handle damage confirmation
  static handleDamageConfirm(msg) {
      if (msg.originalSenderId !== game.userId) return;
      console.log(`${MODULE_ID} | Damage confirmed for: ${msg.targetId}`);
  }

  // Emit method for damage
  static emitApplyDamage(targetId, finalDamage, damageType, sourceActorId, affinityMessage) {
      game.socket.emit(`module.${MODULE_ID}`, {
          action: 'applyDamage',
          targetId,
          finalDamage,
          damageType,
          sourceActorId,
          affinityMessage,
          senderId: game.userId
      });
  }

  // Emit confirmation back to sender
  static emitDamageConfirm(targetId, finalDamage, damageType, originalSenderId) {
      game.socket.emit(`module.${MODULE_ID}`, {
          action: 'damageConfirm',
          targetId,
          finalDamage,
          damageType,
          originalSenderId,
          senderId: game.userId
      });
  }

  static emitShuffleDeck() {
  game.socket.emit(`module.${MODULE_ID}`, {
    action: 'shuffleDeck',
    playerId: game.userId
  });
  }

  static handleShuffleDeck(msg) {
    // Another player shuffled their deck, update our view
    if (window.FuAceCards?.UIManager) {
      window.FuAceCards.UIManager.renderTable();
    }
  }

  // Handle healing request from player
  static handleApplyHealing(msg) {
  // Only the GM should process this
  if (!game.user.isGM) {
    console.log(`${MODULE_ID} | Non-GM received healing socket message, ignoring`);
    return;
  }
  
  console.log(`${MODULE_ID} | GM received healing socket message:`, msg);
  
  const { targetId, hpAmount, mpAmount, sourceActorId, sourceActorName } = msg;
  
  // Find the target token/actor
  console.log(`${MODULE_ID} | Looking for target with ID: ${targetId}`);
  
  // Try as token ID first
  let token = canvas.tokens.placeables.find(t => t.id === targetId);
  let actor = token?.actor;
  
  // If not found as token, try as actor ID
  if (!actor) {
    console.log(`${MODULE_ID} | No token found with ID ${targetId}, looking for actor`);
    actor = game.actors.get(targetId);
    
    // If actor found, try to find its token
    if (actor) {
      console.log(`${MODULE_ID} | Found actor ${actor.name}, looking for its token`);
      token = canvas.tokens.placeables.find(t => t.actor?.id === targetId);
    }
  }
  
  if (!actor) {
    console.error(`${MODULE_ID} | Cannot find target actor for healing: ${targetId}`);
    return;
  }
  
  console.log(`${MODULE_ID} | GM applying healing via socket: ${hpAmount} HP, ${mpAmount} MP to ${actor.name}`);
  
  try {
    // Use direct update method
    const updates = {};
    
    // Handle HP
    if (hpAmount > 0) {
      const currentHP = actor.system.resources?.hp?.value || 0;
      const maxHP = actor.system.resources?.hp?.max || 0;
      const newHP = Math.min(currentHP + hpAmount, maxHP);
      
      updates["system.resources.hp.value"] = newHP;
    }
    
    // Handle MP
    if (mpAmount > 0) {
      const currentMP = actor.system.resources?.mp?.value || 0;
      const maxMP = actor.system.resources?.mp?.max || 0;
      const newMP = Math.min(currentMP + mpAmount, maxMP);
      
      updates["system.resources.mp.value"] = newMP;
    }
    
    // Apply updates
    if (Object.keys(updates).length > 0) {
      console.log(`${MODULE_ID} | Updating actor with:`, updates);
      actor.update(updates).then(() => {
        console.log(`${MODULE_ID} | Successfully updated ${actor.name}`);
        
        // Show floating text
        if (token) {
          let text = "";
          if (hpAmount > 0) text += `+${hpAmount} HP `;
          if (mpAmount > 0) text += `+${mpAmount} MP`;
          
          canvas.interface.createScrollingText(token.center, text.trim(), {
            fontSize: 24,
            fill: "#00ff00",
            stroke: 0x000000,
            strokeThickness: 4
          });
        }
        
        // Send confirmation back
        this.emitHealingConfirm(
          targetId,
          hpAmount,
          mpAmount,
          msg.senderId
        );
      }).catch(error => {
        console.error(`${MODULE_ID} | Error updating actor:`, error);
      });
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Error applying healing via socket:`, error);
  }
  }

  // Handle healing confirmation
  static handleHealingConfirm(msg) {
  // Only process if this is for the original sender
  if (msg.originalSenderId !== game.userId) {
    console.log(`${MODULE_ID} | Ignoring healing confirmation meant for another user`);
    return;
  }
  
  console.log(`${MODULE_ID} | Received healing confirmation:`, msg);
  
  // Show notification
  ui.notifications.info(`GM applied healing to target`);
  }

  // Handle status effect application request
  static handleApplyStatusEffect(msg) {
    // Only the GM should process this
    if (!game.user.isGM) return;
    
    const { targetId, effect, remove, sourceActorId, senderId } = msg;
    
    // Find the target token
    const token = canvas.tokens.placeables.find(t => t.id === targetId);
    if (!token || !token.actor) {
      console.error(`${MODULE_ID} | Cannot find token: ${targetId}`);
      return;
    }
    
    const targetActor = token.actor;
    
    console.log(`${MODULE_ID} | GM ${remove ? 'removing' : 'applying'} status: ${effect} to ${targetActor.name}`);
    
    try {
      // Try system method first
      if (game.projectfu && typeof game.projectfu.toggleStatus === 'function') {
        game.projectfu.toggleStatus(effect, targetActor, !remove);
      } else {
        // Fallback to manual method
        if (remove) {
          // Find and remove the effect
          const effectEntity = targetActor.effects?.find(e => 
            e.statuses?.has(effect) || 
            e.flags?.core?.statusId === effect
          );
          
          if (effectEntity) {
            effectEntity.delete();
          }
        } else {
          // Add the effect
          const statusEffect = CONFIG.statusEffects.find(e => e.id === effect);
          if (statusEffect) {
            targetActor.createEmbeddedDocuments("ActiveEffect", [{
              label: statusEffect.label,
              icon: statusEffect.icon,
              origin: null,
              statuses: [effect],
              flags: {
                core: {
                  statusId: effect
                }
              }
            }]);
          }
        }
      }
      
      // Send confirmation back
      this.emitStatusConfirm(
        targetId,
        effect,
        remove,
        senderId
      );
    } catch (error) {
      console.error(`${MODULE_ID} | Error applying status effect via socket:`, error);
    }
  }

  // Handle status effect confirmation
  static handleStatusConfirm(msg) {
    // Only process if this is for the original sender
    if (msg.originalSenderId !== game.userId) return;
    
    console.log(`${MODULE_ID} | Received status effect confirmation:`, msg);
    
    // Show notification
    const action = msg.remove ? 'removed from' : 'applied to';
    ui.notifications.info(`GM ${action} status ${msg.effect} to ${msg.targetId}`);
  }

  // Emit methods
  static emitApplyHealing(targetId, hpAmount, mpAmount, sourceActorId, sourceActorName) {
    console.log(`${MODULE_ID} | Emitting healing request for token: ${targetId}`);
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'applyHealing',
      targetId,
      hpAmount,
      mpAmount,
      sourceActorId,
      sourceActorName,
      senderId: game.userId
    });
  }

  static emitHealingConfirm(targetId, hpAmount, mpAmount, originalSenderId) {
  console.log(`${MODULE_ID} | Sending healing confirmation for ${targetId} to ${originalSenderId}`);
  game.socket.emit(`module.${MODULE_ID}`, {
    action: 'healingConfirm',
    targetId,
    hpAmount,
    mpAmount,
    originalSenderId,
    senderId: game.userId
  });
  }

  static emitApplyStatusEffect(targetId, effect, remove, sourceActorId) {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'applyStatusEffect',
      targetId,
      effect,
      remove,
      sourceActorId,
      senderId: game.userId
    });
  }

  static emitStatusConfirm(targetId, effect, remove, originalSenderId) {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'statusConfirm',
      targetId,
      effect,
      remove,
      originalSenderId,
      senderId: game.userId
    });
  }
  
  static emitCardToTable(cardId) {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'cardToTable',
      cardId: cardId,
      senderId: game.userId
    });
  }
  
  static emitSetPlayed(setType, cardIds) {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'setPlayed',
      setType: setType,
      cardIds: cardIds,
      playerId: game.userId
    });
  }
  
  static emitSetActivated(setType, cardIds) {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'setActivated',
      setType: setType,
      cardIds: cardIds,
      playerId: game.userId
    });
  }
  
  static emitCleanTable() {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: 'cleanTable',
      senderId: game.userId
    });
  }

  static emitCardReturnedToHand(cardId) {
  game.socket.emit(`module.${MODULE_ID}`, {
    action: 'returnCardToHand',
    cardId: cardId,
    senderId: game.userId
  });
  }
}