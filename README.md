# Fabula Ultima: Ace of Cards
A Foundry VTT module that provides card management for the Ace of Cards class from Fabula Ultima. This module gives players a shared table area and personal hand UI to manage their card decks, detect valid card sets, and apply in-game effects.

Use this manifest URL in Foundry's module installer:
``https://raw.githubusercontent.com/mordachai/fu-ace-cards/refs/heads/main/module.json``

## Features
- Hand Drawer UI: Collapsible drawer for your hand of cards
- Shared Table: Display played cards for all players to see
- Set Detection: Automatically highlights valid card combinations
- Joker Support: Assign suits and values to joker cards
- Automatic Effects: Apply damage, healing, and status effects directly to tokens

## Setup
### 1. Choose a deck for each player with Magic Cards

To create a deck, just drag from the compendium to the Card Stack area in the right side panel.

Choose one of the 3 decks available:
- Elemental Deck: Artistic four elements cards specially created for the Ace of Cards class. 
- Foundry Light: based on Foundry's Poker Cards deck.
- Suits Deck: classical  poker suits, with elemental motifs.

Or create your own using Foundry's deck tools and components. Decks can be the same or different from each other, the important part is that each player who has Magic Cards has their own deck.

NOTE: It's a good idea to add the player's name to the deck's name to keep track easily.

### 2. Create Hand and Discard for each player with Magic Cards

Still on the Card Stack menu, create a Hand object (HAND) and a Discard Pile object (PILE). In the same way, name them accordingly.

You will note that there is a Table component already there. Assign OWNER to any player with the Magical Cards skill and leave the rest as OBSERVER.


### 3. Module Configuration
In the Configure Settings section, in the Fabula ultima: Ace of Cards entry:
Go to the Deck Configuration and assign the correct Deck, Hand, and Discard for the player(s). Ignore any players that does not have the Magic Cards skill.

Save and reload the canvas, if the players dont see changes make them reload too.

Thats it
