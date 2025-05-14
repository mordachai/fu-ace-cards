// scripts/healing-integration.js
import { MODULE_ID } from './settings.js';

export class HealingIntegration {
    
    /**
     * Apply healing from a Jackpot set (777 HP and MP to all allies)
     * @param {Actor} sourceActor - The actor who played the set
     * @param {Array} targets - Array of target actors (allies)
     */
    static async applyJackpotHealing(sourceActor, targets) {
        if (!targets || targets.length === 0) {
            ui.notifications.warn("No targets selected. Use the targeting tool to select allies.");
            return { applied: false };
        }
        
        const results = [];
        const amount = 777; // Fixed amount for Jackpot
        
        for (const target of targets) {
            await this.applyResourceChange(target, amount, amount);
            
            // Add to results
            results.push({
                actor: target,
                hp: amount,
                mp: amount
            });
        }
        
        // Create chat message showing healing results
        await this.createHealingMessage(sourceActor, results, 'jackpot');
        
        return {
            applied: true,
            results: results
        };
    }
    
    /**
     * Show dialog for Triple Support healing allocation
     * @param {Number} totalValue - The total value of cards in the set
     * @param {Actor} sourceActor - The actor who played the set
     * @param {Array} targets - Array of target actors (allies)
     */
    static async showHealingAllocationDialog(totalValue, sourceActor, targets) {
        if (!targets || targets.length === 0) {
            ui.notifications.warn("No targets selected. Use the targeting tool to select allies.");
            return { applied: false };
        }
        
        // Calculate total healing available (sum × 3)
        const totalHealing = totalValue * 3;
        
        // Prepare data for the dialog
        const dialogData = {
            title: "Healing Allocation",
            totalHealing: totalHealing,
            targets: targets.map(t => ({
                id: t.id,
                name: t.name,
                img: t.img,
                hp: {
                    current: t.system.resources.hp.value,
                    max: t.system.resources.hp.max
                },
                mp: {
                    current: t.system.resources.mp.value,
                    max: t.system.resources.mp.max
                },
                allocatedHP: 0,
                allocatedMP: 0
            }))
        };
        
        // Render the dialog template
        const content = await renderTemplate(`modules/${MODULE_ID}/templates/healing-allocation.hbs`, dialogData);
        
        return new Promise((resolve) => {
            // Create dialog
            new Dialog({
                title: "Triple Support - Healing Allocation",
                content: content,
                buttons: {
                    apply: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Apply",
                        callback: async (html) => {
                            // Parse allocated values from the form
                            const results = [];
                            let totalAllocated = 0;
                            
                            for (const target of dialogData.targets) {
                                const hpInput = html.find(`#hp-${target.id}`);
                                const mpInput = html.find(`#mp-${target.id}`);
                                
                                const allocatedHP = parseInt(hpInput.val()) || 0;
                                const allocatedMP = parseInt(mpInput.val()) || 0;
                                
                                totalAllocated += allocatedHP + allocatedMP;
                                
                                // Find the actor
                                const actor = game.actors.get(target.id);
                                if (actor) {
                                    // Apply healing
                                    await this.applyResourceChange(actor, allocatedHP, allocatedMP);
                                    
                                    // Track result
                                    results.push({
                                        actor: actor,
                                        hp: allocatedHP,
                                        mp: allocatedMP
                                    });
                                }
                            }
                            
                            // Create chat message showing allocation
                            await this.createHealingMessage(sourceActor, results, 'triple-support');
                            
                            // Resolve with results
                            resolve({
                                applied: true,
                                results: results
                            });
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancel",
                        callback: () => resolve({ applied: false })
                    }
                },
                default: "apply",
                width: 400,
                height: "auto",
                classes: ["projectfu", "fu-healing-dialog"]
            }).render(true);
        });
    }
    
    /**
     * Apply Triple Support healing based on card values
     * @param {Number} totalValue - The total value of cards
     * @param {Actor} sourceActor - The actor who played the set
     * @param {Array} targets - Array of target actors (allies)
     */
    static async applyTripleSupportHealing(totalValue, sourceActor, targets) {
        return this.showHealingAllocationDialog(totalValue, sourceActor, targets);
    }
    
    /**
     * Show dialog for Full Status effect selection
     * @param {Number} highestValue - The highest value among resolved cards
     * @param {Actor} sourceActor - The actor who played the set
     */
    static async showStatusEffectDialog(highestValue, sourceActor) {
        // Determine if we're removing from allies or applying to enemies
        const isEven = highestValue % 2 === 0;
        const targets = isEven ? 
            // Get targeted allies if even
            Array.from(game.user.targets)
                .filter(t => t.actor && t.disposition === 1)
                .map(t => t.actor) : 
            // Get targeted enemies if odd
            Array.from(game.user.targets)
                .filter(t => t.actor && t.disposition === -1)
                .map(t => t.actor);
        
        if (targets.length === 0) {
            ui.notifications.warn(`No ${isEven ? "allies" : "enemies"} targeted. Use targeting tool to select ${isEven ? "allies" : "enemies"}.`);
            return { applied: false };
        }
        
        // Define statuses that can be selected
        const statuses = [
            { id: "dazed", label: "Dazed", icon: "systems/projectfu/styles/static/statuses/Dazed.webp" },
            { id: "shaken", label: "Shaken", icon: "systems/projectfu/styles/static/statuses/Shaken.webp" },
            { id: "slow", label: "Slow", icon: "systems/projectfu/styles/static/statuses/Slow.webp" },
            { id: "weak", label: "Weak", icon: "systems/projectfu/styles/static/statuses/Weak.webp" }
        ];
        
        // Prepare data for the dialog
        const dialogData = {
            isEven,
            targets,
            statuses,
            mode: isEven ? "remove" : "apply"
        };
        
        // Render the dialog template
        const content = await renderTemplate(`modules/${MODULE_ID}/templates/status-effect-selector.hbs`, dialogData);
        
        return new Promise((resolve) => {
            // Create dialog
            new Dialog({
                title: `Full Status - ${isEven ? "Remove" : "Apply"} Status Effects`,
                content: content,
                buttons: {
                    apply: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Apply",
                        callback: async (html) => {
                            // Get selected status effects (limit to 2)
                            const selectedEffects = [];
                            html.find('input[name="status"]:checked').each(function() {
                                if (selectedEffects.length < 2) {
                                    selectedEffects.push($(this).val());
                                }
                            });
                            
                            if (selectedEffects.length !== 2) {
                                ui.notifications.warn("You must select exactly 2 status effects.");
                                return resolve({ applied: false });
                            }
                            
                            // Process status effects
                            const results = [];
                            
                            for (const target of targets) {
                                // Apply or remove each selected effect
                                for (const effectId of selectedEffects) {
                                    await this.applyStatusEffectChange(
                                        target, 
                                        effectId, 
                                        isEven // If even, we're removing; if odd, we're applying
                                    );
                                }
                                
                                results.push({
                                    actor: target,
                                    effects: selectedEffects,
                                    mode: isEven ? "removed" : "applied"
                                });
                            }
                            
                            // Create chat message showing results
                            await this.createStatusEffectMessage(sourceActor, results, 'full-status', highestValue);
                            
                            // Resolve with results
                            resolve({
                                applied: true,
                                results: results
                            });
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancel",
                        callback: () => resolve({ applied: false })
                    }
                },
                default: "apply",
                width: 400,
                height: "auto",
                classes: ["projectfu", "fu-status-dialog"]
            }).render(true);
        });
    }
    
    /**
     * Apply Full Status effects
     * @param {Number} highestValue - The highest value among resolved cards
     * @param {Actor} sourceActor - The actor who played the set
     */
    static async applyFullStatusEffects(highestValue, sourceActor) {
        return this.showStatusEffectDialog(highestValue, sourceActor);
    }
    
    /**
     * Apply HP/MP changes to an actor
     * @param {Actor} actor - The actor to modify
     * @param {Number} hpAmount - Amount of HP to restore
     * @param {Number} mpAmount - Amount of MP to restore
     */
    static async applyResourceChange(actor, hpAmount, mpAmount) {
        if (!actor) return;
        
        const updates = {};
        
        // Handle HP
        if (hpAmount > 0) {
            const currentHP = actor.system.resources.hp.value;
            const maxHP = actor.system.resources.hp.max;
            const newHP = Math.min(currentHP + hpAmount, maxHP);
            
            updates["system.resources.hp.value"] = newHP;
            
            // Show floating text for healing
            this.showFloatingText(actor, `+${hpAmount} HP`, "#00ff00");
        }
        
        // Handle MP
        if (mpAmount > 0) {
            const currentMP = actor.system.resources.mp.value;
            const maxMP = actor.system.resources.mp.max;
            const newMP = Math.min(currentMP + mpAmount, maxMP);
            
            updates["system.resources.mp.value"] = newMP;
            
            // Show floating text for MP restore
            this.showFloatingText(actor, `+${mpAmount} MP`, "#4488ff");
        }
        
        // Apply updates if any
        if (Object.keys(updates).length > 0) {
            return actor.update(updates);
        }
    }
    
    /**
     * Apply status effect changes to an actor
     * @param {Actor} actor - The actor to modify
     * @param {String} effect - The effect ID to apply/remove
     * @param {Boolean} remove - Whether to remove (true) or apply (false)
     */
    static async applyStatusEffectChange(actor, effect, remove) {
        if (!actor) return;
        
        try {
            // Check for system-specific methods first
            if (game.projectfu && typeof game.projectfu.updateActorStatus === 'function') {
                return game.projectfu.updateActorStatus(actor, effect, !remove);
            }
            
            // Manual approach as fallback
            const effects = actor.effects || actor.actorEffects;
            
            if (remove) {
                // Find and remove the effect
                const effectToRemove = effects.find(e => e.statuses?.has(effect) || 
                                                     e.flags?.core?.statusId === effect);
                if (effectToRemove) {
                    await effectToRemove.delete();
                    return true;
                }
            } else {
                // Add the effect
                const statusEffect = CONFIG.statusEffects.find(e => e.id === effect);
                if (statusEffect) {
                    await actor.createEmbeddedDocuments("ActiveEffect", [{
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
                    return true;
                }
            }
        } catch (error) {
            console.error(`Error ${remove ? "removing" : "applying"} status effect ${effect}:`, error);
            return false;
        }
        
        return false;
    }
    
    /**
     * Create a chat message showing healing results
     * @param {Actor} sourceActor - The actor who applied the healing
     * @param {Array} results - Results of healing
     * @param {String} setType - Type of set that caused the healing
     */
    static async createHealingMessage(sourceActor, results, setType) {
        // Get set name for display
        const setNames = {
            'jackpot': 'Jackpot',
            'triple-support': 'Triple Support',
            'full-status': 'Full Status'
        };
        
        const setName = setNames[setType] || setType;
        
        // Build message content
        let content = `<div class="fu-healing-results">`;
        content += `<h3>${sourceActor?.name || 'Effect'} activates ${setName}</h3>`;
        
        // Show heal summary
        if (setType === 'jackpot') {
            content += `<p>All allies recover 777 HP and 777 MP!</p>`;
        } else if (setType === 'triple-support') {
            content += `<p>Allies recover HP and MP:</p>`;
        }
        
        // Show detailed results
        content += `<ul class="fu-healing-list">`;
        results.forEach(result => {
            if ('hp' in result && 'mp' in result) {
                content += `<li><strong>${result.actor.name}</strong>: `;
                
                if (result.hp > 0) {
                    content += `<span class="fu-hp-heal">+${result.hp} HP</span>`;
                }
                
                if (result.hp > 0 && result.mp > 0) {
                    content += ` and `;
                }
                
                if (result.mp > 0) {
                    content += `<span class="fu-mp-heal">+${result.mp} MP</span>`;
                }
                
                content += `</li>`;
            }
        });
        content += `</ul></div>`;
        
        // Create message
        return ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
            content: content
        });
    }
    
    /**
     * Create a chat message showing status effect results
     * @param {Actor} sourceActor - The actor who applied the effects
     * @param {Array} results - Results of status effect changes
     * @param {String} setType - Type of set that caused the effect
     * @param {Number} highestValue - The highest value from the set
     */
    static async createStatusEffectMessage(sourceActor, results, setType, highestValue) {
        // Build message content
        let content = `<div class="fu-status-results">`;
        content += `<h3>${sourceActor?.name || 'Effect'} activates Full Status</h3>`;
        
        // Determine if effects were removed or applied
        const isEven = highestValue % 2 === 0;
        const mode = isEven ? "removed from" : "applied to";
        const targetType = isEven ? "allies" : "enemies";
        
        // Show summary
        content += `<p>The following status effects were ${mode} ${targetType}:</p>`;
        
        // Get a unique list of effects
        const allEffects = [];
        results.forEach(result => {
            result.effects.forEach(effect => {
                if (!allEffects.includes(effect)) {
                    allEffects.push(effect);
                }
            });
        });
        
        // Show effects first
        content += `<div class="fu-status-list">`;
        allEffects.forEach(effect => {
            const statusConfig = CONFIG.statusEffects.find(e => e.id === effect);
            if (statusConfig) {
                content += `<a data-status="${effect}" class="inline inline-effect" data-tooltip="${statusConfig.label}">`;
                content += `<img src="${statusConfig.icon}" width="16" height="16" style="margin-right: 2px; margin-left: 2px;">`;
                content += `${statusConfig.label}</a>`;
            } else {
                content += `<span class="inline">${effect}</span>`;
            }
        });
        content += `</div>`;
        
        // Show targets
        content += `<p>Affected ${targetType}:</p>`;
        content += `<ul class="fu-target-list">`;
        const processedActors = new Set();
        results.forEach(result => {
            if (!processedActors.has(result.actor.id)) {
                content += `<li><strong>${result.actor.name}</strong></li>`;
                processedActors.add(result.actor.id);
            }
        });
        content += `</ul></div>`;
        
        // Create message
        return ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
            content: content
        });
    }
    
    /**
     * Show floating text above a token
     * @param {Actor} actor - The actor receiving the effect
     * @param {String} text - Text to display
     * @param {String} color - Text color (hex)
     */
    static showFloatingText(actor, text, color = "#FFFFFF") {
        // Try to find the actor's token on the canvas
        const token = canvas.tokens.placeables.find(t => t.actor && t.actor.id === actor.id);
        
        if (token && canvas.interface) {
            const style = {
                fontSize: 24,
                fill: color,
                stroke: 0x000000,
                strokeThickness: 4
            };
            
            canvas.interface.createScrollingText(token.center, text, style);
        }
    }
    
    /**
     * Apply a card set's effect as healing or status effect
     * @param {Object} setData - The set data containing type, cards, etc.
     * @param {Actor} sourceActor - The actor who played the set
     * @param {Array} targets - Array of target actors
     */
    static async applySetEffect(setData, sourceActor, targets) {
        if (!targets || targets.length === 0) {
            ui.notifications.warn("No targets selected");
            return null;
        }
        
        // Process based on set type
        switch (setData.type) {
            case 'jackpot':
                return await this.applyJackpotHealing(sourceActor, targets);
                
            case 'triple-support': {
                const totalValue = setData.values.reduce((sum, val) => sum + val, 0);
                return await this.applyTripleSupportHealing(totalValue, sourceActor, targets);
            }
                
            case 'full-status': {
                const highestValue = Math.max(...setData.values);
                return await this.applyFullStatusEffects(highestValue, sourceActor);
            }
                
            default:
                ui.notifications.info(`The set "${setData.type}" does not have a healing or status effect`);
                return null;
        }
    }
    
    /**
     * Determine if a set has a healing or status effect
     * @param {String} setType - The type of set
     * @returns {Boolean} - Whether this set has healing/status effects
     */
    static isHealingOrStatusSet(setType) {
        return ['jackpot', 'triple-support', 'full-status'].includes(setType);
    }
}