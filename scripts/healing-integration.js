// scripts/healing-integration.js
import { MODULE_ID } from './settings.js';
import { SocketManager } from './socket-manager.js';

export class HealingIntegration {
    
    /**
     * Apply healing from a Jackpot set (777 HP and MP to all allies)
     * @param {Actor} sourceActor - The actor who played the set
     * @param {Array} targets - Array of target actors (allies)
     */
    static async applyJackpotHealing(sourceActor, targets) {
        // If no targets provided, use selected targets
        if (!targets || targets.length === 0) {
            targets = Array.from(game.user.targets)
                .filter(t => t.actor)
                .map(t => t.actor);
                
            console.log(`${MODULE_ID} | Jackpot | Using selected targets:`, targets.map(t => t.name));
        }
        
        // Always include the source actor if they're not already in targets
        if (sourceActor && !targets.some(t => t.id === sourceActor.id)) {
            targets.unshift(sourceActor);
            console.log(`${MODULE_ID} | Jackpot | Added source actor to targets`);
        }
        
        if (targets.length === 0) {
            ui.notifications.warn("No targets selected. Use the targeting tool to select allies.");
            return { applied: false };
        }
        
        const results = [];
        const amount = 777; // Fixed amount for Jackpot
        
        for (const target of targets) {
            const result = await this.applyResourceChange(target, amount, amount, sourceActor);
            
            // Add to results
            results.push({
                actor: target,
                hp: amount,
                mp: amount,
                viaSocket: result && result.viaSocket
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
        // If no targets provided, try to use selected targets instead
        if (!targets || targets.length === 0) {
            // Use user's selected targets
            targets = Array.from(game.user.targets)
                .filter(t => t.actor) // Make sure there's an actor associated
                .map(t => t.actor);
                
            console.log(`${MODULE_ID} | Using selected targets:`, targets.map(t => t.name));
        }
        
        // Always include the source actor if they're not already in targets
        if (sourceActor && !targets.some(t => t.id === sourceActor.id)) {
            targets.unshift(sourceActor);
            console.log(`${MODULE_ID} | Added source actor to targets`);
        }
        
        if (targets.length === 0) {
            ui.notifications.warn("No targets selected. Use the targeting tool to select allies.");
            return { applied: false };
        }
        
        // Calculate total healing available (sum × 3)
        const totalHealing = totalValue * 3;
        
        // Find token for each actor (needed for socket communication)
        const targetData = [];
        for (const actor of targets) {
            // Find token on canvas
            const token = canvas.tokens.placeables.find(t => t.actor && t.actor.id === actor.id);
            
            targetData.push({
                id: actor.id,
                tokenId: token?.id || null,
                name: actor.name,
                img: actor.img || "icons/svg/mystery-man.svg",
                hp: {
                    current: actor.system.resources?.hp?.value || 0,
                    max: actor.system.resources?.hp?.max || 0
                },
                mp: {
                    current: actor.system.resources?.mp?.value || 0,
                    max: actor.system.resources?.mp?.max || 0
                },
                allocatedHP: 0,
                allocatedMP: 0,
                isOwner: actor.isOwner
            });
        }
        
        // Prepare data for the dialog
        const dialogData = {
            title: "Healing Allocation",
            totalHealing: totalHealing,
            targets: targetData
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
                                
                                // Skip if no healing allocated
                                if (allocatedHP === 0 && allocatedMP === 0) continue;
                                
                                totalAllocated += allocatedHP + allocatedMP;
                                
                                // Find the actor - check game.actors AND tokens
                                let actor = game.actors.get(target.id);
                                
                                // If not found in game.actors, check token actors
                                if (!actor) {
                                    const token = canvas.tokens.placeables.find(t => t.actor?.id === target.id);
                                    if (token) actor = token.actor;
                                }
                                
                                if (actor) {
                                    // Apply healing using token ID if available
                                    const result = await this.applyResourceChange(
                                        actor, 
                                        allocatedHP, 
                                        allocatedMP, 
                                        sourceActor,
                                        target.tokenId
                                    );
                                    
                                    // Track result
                                    results.push({
                                        actor: actor,
                                        hp: allocatedHP,
                                        mp: allocatedMP,
                                        viaSocket: result && result.viaSocket
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
        console.log(`${MODULE_ID} | Triple Support Healing | Source actor:`, sourceActor?.name);
        
        // Log initial targets if provided
        if (targets && targets.length > 0) {
            console.log(`${MODULE_ID} | Triple Support Healing | Initial targets:`, 
                targets.map(t => t.name));
        } else {
            console.log(`${MODULE_ID} | Triple Support Healing | No initial targets provided`);
        }
        
        // If no targets provided, we'll handle this in the dialog
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
        
        // Get target tokens first (we need token data for socket communication)
        const targetTokens = Array.from(game.user.targets);
        
        if (targetTokens.length === 0) {
            ui.notifications.warn(`No targets selected. Use targeting tool to select ${isEven ? "allies" : "enemies"}.`);
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
            targetTokens,
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
                            
                            for (const token of targetTokens) {
                                if (!token.actor) continue;
                                
                                // Apply or remove each selected effect
                                for (const effectId of selectedEffects) {
                                    await this.applyStatusEffectChange(
                                        token.actor, 
                                        effectId, 
                                        isEven, // If even, we're removing; if odd, we're applying
                                        sourceActor,
                                        token.id // Pass token ID for socket communication
                                    );
                                }
                                
                                results.push({
                                    actor: token.actor,
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
     * Apply resource changes with permission handling
     * @param {Actor} actor - The actor to modify
     * @param {Number} hpAmount - Amount of HP to restore
     * @param {Number} mpAmount - Amount of MP to restore
     * @param {Actor} sourceActor - Actor who applied the healing
     * @param {String} tokenId - Optional token ID for socket communication
     */
    static async applyResourceChange(actor, hpAmount, mpAmount, sourceActor = null, tokenId = null) {
        if (!actor) return false;
        
        console.log(`${MODULE_ID} | Attempting to heal actor: ${actor.name} (ID: ${actor.id})`);
        
        try {
            // Check if this is the player's own actor
            const isOwnedActor = actor.isOwner;
            console.log(`${MODULE_ID} | Is actor owned by current user: ${isOwnedActor}`);
            
            if (isOwnedActor) {
                // Player can modify their own actor directly
                const updates = {};
                
                // Handle HP
                if (hpAmount > 0) {
                    const currentHP = actor.system.resources?.hp?.value || 0;
                    const maxHP = actor.system.resources?.hp?.max || 0;
                    const newHP = Math.min(currentHP + hpAmount, maxHP);
                    
                    updates["system.resources.hp.value"] = newHP;
                    
                    // Show floating text
                    this.showFloatingText(actor, `+${hpAmount} HP`, "#00ff00");
                }
                
                // Handle MP
                if (mpAmount > 0) {
                    const currentMP = actor.system.resources?.mp?.value || 0;
                    const maxMP = actor.system.resources?.mp?.max || 0;
                    const newMP = Math.min(currentMP + mpAmount, maxMP);
                    
                    updates["system.resources.mp.value"] = newMP;
                    
                    // Show floating text for MP
                    this.showFloatingText(actor, `+${mpAmount} MP`, "#4488ff");
                }
                
                // Apply updates if any
                if (Object.keys(updates).length > 0) {
                    console.log(`${MODULE_ID} | Applying healing directly to owned actor`);
                    await actor.update(updates);
                    return {
                        success: true,
                        actor: actor,
                        hp: hpAmount,
                        mp: mpAmount
                    };
                }
            } else {
                // Need GM permission - send socket message
                if (game.user.isGM) {
                    // GM can update directly
                    console.log(`${MODULE_ID} | GM applying healing directly`);
                    const updates = {};
                    
                    // Handle HP
                    if (hpAmount > 0) {
                        const currentHP = actor.system.resources?.hp?.value || 0;
                        const maxHP = actor.system.resources?.hp?.max || 0;
                        const newHP = Math.min(currentHP + hpAmount, maxHP);
                        
                        updates["system.resources.hp.value"] = newHP;
                        
                        // Show floating text
                        this.showFloatingText(actor, `+${hpAmount} HP`, "#00ff00");
                    }
                    
                    // Handle MP
                    if (mpAmount > 0) {
                        const currentMP = actor.system.resources?.mp?.value || 0;
                        const maxMP = actor.system.resources?.mp?.max || 0;
                        const newMP = Math.min(currentMP + mpAmount, maxMP);
                        
                        updates["system.resources.mp.value"] = newMP;
                        
                        // Show floating text for MP
                        this.showFloatingText(actor, `+${mpAmount} MP`, "#4488ff");
                    }
                    
                    // Apply updates if any
                    if (Object.keys(updates).length > 0) {
                        await actor.update(updates);
                        return {
                            success: true,
                            actor: actor,
                            hp: hpAmount,
                            mp: mpAmount
                        };
                    }
                } else {
                    // Send socket message to GM
                    console.log(`${MODULE_ID} | Sending socket message to GM for actor: ${actor.name}`);
                    
                    // Find token ID if not provided
                    console.log(`${MODULE_ID} | Sending socket message to GM for actor: ${actor.name}`);

                    // Find token ID if not provided
                    if (!tokenId) {
                        // First try to find the token by looking at the current targets
                        const targetedToken = Array.from(game.user.targets).find(t => t.actor?.id === actor.id);
                        if (targetedToken) {
                            tokenId = targetedToken.id;
                            console.log(`${MODULE_ID} | Found token ID ${tokenId} from current targets for ${actor.name}`);
                        } else {
                            // Fall back to scanning all tokens on the canvas
                            const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
                            if (token) {
                                tokenId = token.id;
                                console.log(`${MODULE_ID} | Found token ID ${tokenId} from canvas for ${actor.name}`);
                            } else {
                                // As a last resort, use actor ID
                                tokenId = actor.id;
                                console.log(`${MODULE_ID} | Using actor ID ${tokenId} as fallback for ${actor.name}`);
                            }
                        }
                    }

                    console.log(`${MODULE_ID} | Emitting applyHealing for ${actor.name} using ID: ${tokenId}`);
                    
                    // Use token ID for better targeting
                    SocketManager.emitApplyHealing(
                        tokenId, // Use token ID for targeting
                        hpAmount, 
                        mpAmount,
                        sourceActor?.id || null,
                        sourceActor?.name || 'Unknown'
                    );
                    
                    // Return success but note it was via socket
                    return { 
                        success: true, 
                        viaSocket: true,
                        actor: actor,
                        hp: hpAmount,
                        mp: mpAmount
                    };
                }
            }
        } catch (error) {
            console.error(`${MODULE_ID} | Error applying resource changes to ${actor.name}:`, error);
            ui.notifications.error(`Failed to apply healing to ${actor.name}: ${error.message}`);
            return false;
        }
    }

    /**
     * Apply status effect changes to an actor with permission handling
     * @param {Actor} actor - The actor to modify
     * @param {String} effect - The effect ID to apply/remove
     * @param {Boolean} remove - Whether to remove (true) or apply (false)
     * @param {Actor} sourceActor - Actor who applied the effect
     * @param {String} tokenId - Optional token ID for socket communication
     */
    static async applyStatusEffectChange(actor, effect, remove, sourceActor = null, tokenId = null) {
        if (!actor) return false;
        
        try {
            // Check if this is the player's own actor
            const isOwnedActor = actor.isOwner;
            
            if (isOwnedActor) {
                // Player can modify their own actor directly
                // Check for system-specific methods first
                if (game.projectfu && typeof game.projectfu.toggleStatus === 'function') {
                    return game.projectfu.toggleStatus(effect, actor, !remove);
                }
                
                // Manual approach as fallback
                if (remove) {
                    // Find and remove the effect
                    const effectEntity = actor.effects?.find(e => 
                        e.statuses?.has(effect) || 
                        e.flags?.core?.statusId === effect
                    );
                    
                    if (effectEntity) {
                        await effectEntity.delete();
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
            } else {
                // Need GM permission - send socket message
                if (game.user.isGM) {
                    // GM can update directly
                    return this.applyStatusEffectChange(actor, effect, remove, sourceActor);
                } else {
                    // Find token ID if not provided
                    if (!tokenId) {
                        const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
                        if (token) {
                            tokenId = token.id;
                        } else {
                            tokenId = actor.id; // Fall back to actor ID
                        }
                    }
                    
                    // Send socket message to GM using token ID
                    SocketManager.emitApplyStatusEffect(
                        tokenId, // Use token ID for targeting
                        effect,
                        remove,
                        sourceActor?.id || null
                    );
                    
                    // Return success but note it was via socket
                    return { 
                        success: true, 
                        viaSocket: true,
                        actor: actor.name,
                        effect: effect,
                        remove: remove
                    };
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
        
        // Sort results - put character at the top, then owned tokens, then others
        const sortedResults = [...results].sort((a, b) => {
            // Sort by ownership (character first, then owned, then others)
            if (a.actor.id === sourceActor?.id) return -1;
            if (b.actor.id === sourceActor?.id) return 1;
            if (a.actor.isOwner && !b.actor.isOwner) return -1;
            if (!a.actor.isOwner && b.actor.isOwner) return 1;
            return a.actor.name.localeCompare(b.actor.name);
        });
        
        sortedResults.forEach(result => {
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
                
                // Indicate if applied via GM
                if (result.viaSocket) {
                    content += ` <span class="fu-via-gm">(via GM)</span>`;
                }
                
                content += `</li>`;
            }
        });
        content += `</ul></div>`;
        
        // Add explanation for socket-based healing
        if (results.some(r => r.viaSocket)) {
            content += `<div class="fu-pending-notice">`;
            content += `<p><i>GM will apply healing to some characters. This message will update once complete.</i></p>`;
            content += `</div>`;
        }
        
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
        
        // Show effects first - use system's elements if possible
        content += `<div class="fu-status-list">`;
        allEffects.forEach(effect => {
            // Try to use the system's status effect inline element pattern
            const statusConfig = CONFIG.statusEffects?.find(e => e.id === effect);
            if (statusConfig) {
                content += `<a data-status="${effect}" data-config="${btoa(JSON.stringify({}))}" `;
                content += `class="inline inline-effect disable-how-to" `;
                content += `data-tooltip="${statusConfig.label}">`;
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
                // Indicate if applied via GM for non-owned actors
                const viaGM = !result.actor.isOwner ? ' <span class="fu-via-gm">(via GM)</span>' : '';
                content += `<li><strong>${result.actor.name}</strong>${viaGM}</li>`;
                processedActors.add(result.actor.id);
            }
        });
        content += `</ul></div>`;
        
        // Add explanation for socket-based effects
        if (results.some(r => !r.actor.isOwner)) {
            content += `<div class="fu-pending-notice">`;
            content += `<p><i>GM will apply status effects to some characters.</i></p>`;
            content += `</div>`;
        }
        
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