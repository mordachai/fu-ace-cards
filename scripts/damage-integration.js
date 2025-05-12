// scripts/damage-integration.js
// Integration with Fabula Ultima damage system

export class DamageIntegration {
    
    /**
     * Apply damage using the Fabula Ultima damage pipeline
     * @param {String} damageType - Type of damage to apply
     * @param {Number} damageValue - Amount of damage to apply
     * @param {Actor} sourceActor - Actor applying the damage
     * @param {Number} targets - Array of target actors
     * @param {Array} traits - Special damage traits to apply
     */
    static async applyDamage(damageType, damageValue, sourceActor, targets, traits = []) {
        // Check if targets and source actor are valid
        if (!targets || targets.length === 0) {
            ui.notifications.warn("No targets selected");
            return { applied: false };
        }
        
        // Try to use system integration if available (without showing errors if not found)
        if (game.projectfu && typeof game.projectfu.applyDamage === 'function') {
            try {
                await game.projectfu.applyDamage(damageType, damageValue, sourceActor, targets, traits);
                return { applied: true };
            } catch (systemError) {
                console.log("System damage function failed, falling back to manual method:", systemError);
                // Fall through to manual method below
            }
        }
        
        // Use our manual implementation
        const results = await DamageIntegration.applyManualDamage(damageType, damageValue, sourceActor, targets, traits);
        
        // Create a chat message showing the damage results
        await DamageIntegration.createDamageResultMessage(damageType, damageValue, sourceActor, results);
        
        return {
            applied: true,
            manual: true,
            results: results
        };
    }
    
    /**
     * Create a chat message showing damage application results
     */
    static async createDamageResultMessage(damageType, damageValue, sourceActor, results) {
        // Get localized damage type name if available
        const damageTypes = CONFIG.projectfu?.damageTypes || {};
        const damageTypeName = damageTypes[damageType] || damageType.toUpperCase();
        
        let content = `<div class="fu-damage-results">`;
        content += `<h3>${sourceActor?.name || 'Effect'} deals ${damageValue} ${damageTypeName} damage</h3>`;
        content += `<ul>`;
        
        results.forEach(result => {
            const effectText = result.finalDamage === 0 ? 
                `No damage (${result.affinity})` : 
                `${Math.abs(result.finalDamage)} damage${result.affinity ? ` (${result.affinity})` : ''}`;
            
            content += `<li><strong>${result.actor.name}</strong>: ${effectText}</li>`;
        });
        
        content += `</ul></div>`;
        
        return ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
            content: content
        });
    }
    
    /**
     * Apply damage manually with proper resistance/immunity handling
     */
    static async applyManualDamage(damageType, damageValue, sourceActor, targets, traits = []) {
        const results = [];
        const ignoreResistances = traits.includes('ignoreResistances');
        const ignoreImmunities = traits.includes('ignoreImmunities');
        
        // Define the affinity values based on your observation
        const AFFINITY = {
            NORMAL: 0,        // Normal damage
            RESISTANCE: 1,    // Resistance (half damage)
            IMMUNITY: 2,      // Immunity (no damage)
            ABSORPTION: 3,    // Absorption (healing)
            VULNERABLE: -1    // Vulnerability (double damage)
        };
        
        for (const target of targets) {
            // Default values
            let multiplier = 1;
            let affinityMessage = "Normal";
            let affinityValue = 0; // Default: no special affinity
            
            // Check for affinities
            if (target.system && target.system.affinities && target.system.affinities[damageType]) {
                // Get the affinity value
                affinityValue = target.system.affinities[damageType].current;
                
                // Log the raw affinity value for debugging
                console.log(`${target.name} affinity for ${damageType}: ${affinityValue}`);
            }
            
            // Apply the correct multiplier based on affinity value
            switch (affinityValue) {
                case AFFINITY.VULNERABLE:
                    multiplier = 2; // Double damage
                    affinityMessage = "Vulnerable";
                    break;
                    
                case AFFINITY.RESISTANCE:
                    if (ignoreResistances) {
                        multiplier = 1; // Normal damage
                        affinityMessage = "Resistance ignored";
                    } else {
                        multiplier = 0.5; // Half damage
                        affinityMessage = "Resistant";
                    }
                    break;
                    
                case AFFINITY.IMMUNITY:
                    if (ignoreImmunities) {
                        multiplier = 1; // Normal damage
                        affinityMessage = "Immunity ignored";
                    } else {
                        multiplier = 0; // No damage
                        affinityMessage = "Immune";
                    }
                    break;
                    
                case AFFINITY.ABSORPTION:
                    if (ignoreImmunities) {
                        multiplier = 1; // Normal damage
                        affinityMessage = "Absorption ignored";
                    } else {
                        multiplier = -1; // Healing
                        affinityMessage = "Absorbed";
                    }
                    break;
                    
                default:
                    // AFFINITY.NORMAL or any other value
                    multiplier = 1;
                    affinityMessage = "Normal";
            }
            
            // Calculate final damage
            const finalDamage = Math.floor(damageValue * multiplier);
            console.log(`Calculated damage for ${target.name}: ${finalDamage} (${affinityMessage})`);
            
            // Apply the damage to the actor
            if (finalDamage !== 0) {
                const hpValue = target.system.resources.hp.value;
                const hpMax = target.system.resources.hp.max;
                
                if (finalDamage < 0) {
                    // Healing (absorption)
                    await target.update({
                        "system.resources.hp.value": Math.min(hpValue - finalDamage, hpMax)
                    });
                    
                    // Show floating text for healing
                    DamageIntegration.showFloatingText(
                        target, 
                        `+${Math.abs(finalDamage)}`, 
                        "green"
                    );
                } else {
                    // Damage
                    await target.update({
                        "system.resources.hp.value": Math.max(hpValue - finalDamage, 0)
                    });
                    
                    // Show floating text for damage
                    DamageIntegration.showFloatingText(
                        target, 
                        `-${finalDamage}`, 
                        "red"
                    );
                }
            } else {
                // No damage due to immunity
                DamageIntegration.showFloatingText(
                    target,
                    "Immune",
                    "yellow"
                );
            }
            
            // Add to results
            results.push({
                actor: target,
                originalDamage: damageValue,
                finalDamage: finalDamage,
                affinity: affinityMessage
            });
        }
        
        return results;
    }
    
    /**
     * Show floating text above a token
     */
    static showFloatingText(actor, text, color = "white") {
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
     * Apply a card set's effect as damage
     * @param {Object} setData - The set data containing type, cards, etc.
     * @param {Actor} sourceActor - The actor who played the set
     * @param {Array} targets - Array of target actors
     */
    static async applySetEffect(setData, sourceActor, targets) {
        if (!targets || targets.length === 0) {
            ui.notifications.warn("No targets selected");
            return null;
        }
        
        // Calculate damage based on set type
        const damageInfo = DamageIntegration.calculateDamageForSet(setData);
        
        if (!damageInfo) {
            ui.notifications.info(`This set (${setData.type}) does not deal damage`);
            return null;
        }
        
        // Determine special traits
        const traits = [];
        
        // Some sets ignore resistances/immunities
        if (setData.type === 'forbidden-monarch') {
            traits.push('ignoreResistances');
            traits.push('ignoreImmunities');
        }
        
        // Apply the damage
        const result = await this.applyDamage(
            damageInfo.type,
            damageInfo.value,
            sourceActor,
            targets,
            traits
        );
        
        return { ...damageInfo, ...result };
    }
    
    /**
     * Calculate damage value and type for a given set
     * @param {Object} setData - The set data
     * @returns {Object|null} - Damage information or null if set does not deal damage
     */
    static calculateDamageForSet(setData) {
        if (!setData || !setData.values || !setData.cards) return null;
        
        // Get total value of all cards
        const totalValue = setData.values.reduce((sum, val) => sum + val, 0);
        const highestValue = Math.max(...setData.values);
        
        // Map suits to damage types
        const suitToDamageType = {
            'hearts': 'fire',
            'heart': 'fire',
            'diamonds': 'air',
            'diamond': 'air',
            'clubs': 'earth',
            'club': 'earth',
            'spades': 'ice',
            'spade': 'ice'
        };
        
        // Determine damage based on set type
        switch (setData.type) {
            case 'magic-flush': {
                // 4 cards of consecutive values and of the same suit
                // Damage: 25 + total value of cards, type matches the suit
                const firstCard = setData.cards[0];
                const suit = DamageIntegration.getCardSuit(firstCard);
                const damageType = suitToDamageType[suit.toLowerCase()] || 'physical';
                
                return {
                    value: 25 + totalValue,
                    type: damageType,
                    highRoll: totalValue,
                    baseDamage: 25
                };
            }
            case 'blinding-flush': {
                // 4 cards of consecutive values
                // Damage: 15 + total value, light if highest is even, dark if odd
                const damageType = highestValue % 2 === 0 ? 'light' : 'dark';
                
                return {
                    value: 15 + totalValue,
                    type: damageType,
                    highRoll: totalValue,
                    baseDamage: 15
                };
            }
            case 'double-trouble': {
                // 2 cards of same value + 2 cards of same value
                // Damage: 10 + highest value among cards
                const firstCard = setData.cards[0];
                const suit = DamageIntegration.getCardSuit(firstCard);
                const damageType = suitToDamageType[suit.toLowerCase()] || 'physical';
                
                return {
                    value: 10 + highestValue,
                    type: damageType,
                    highRoll: highestValue,
                    baseDamage: 10
                };
            }
            case 'forbidden-monarch': {
                // 4 cards of same value + 1 joker
                // Damage: 777, light if common value is even, dark if odd
                const commonValue = setData.value || setData.values[0];
                const damageType = commonValue % 2 === 0 ? 'light' : 'dark';
                
                return {
                    value: 777,
                    type: damageType,
                    highRoll: 0,
                    baseDamage: 777
                };
            }
            default:
                return null;
        }
    }
    
    // Get card suit from card data
    static getCardSuit(card) {
        // Try to get suit from card data, flags, or name
        return card.suit || card.getFlag('fu-ace-cards', 'suit') || 
               card.name.toLowerCase().match(/(clubs?|diamonds?|hearts?|spades?)/)?.[0] || '';
    }
}