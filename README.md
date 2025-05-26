[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/W7W01A1ZN1)

# Fabula Ultima: Ace of Cards
A Foundry VTT module that provides card management for the [**Ace of Cards**](https://www.needgames.it/wp-content/uploads/2023/07/Fabula-Bonus-Ace-of-Cards.pdf) class from [***Fabula Ultima***](https://need.games/fabula-ultima/). This module gives players a shared table area and personal hand UI to manage their card decks, detect valid card sets, and apply in-game effects.

[Ace of Cards](https://github.com/user-attachments/assets/dd3530e4-eecc-49e1-ada8-b6d27f1f56aa)

## Features
- Hand Drawer UI: Collapsible drawer for your hand of cards
- Shared Table: Display played cards for all players to see
- Set Detection: Automatically highlights valid card combinations
- Joker Support: Assign suits and values to joker cards
- Automatic Effects: Apply damage, healing, and status effects directly to tokens

### Installation
Paste this url in the Manifest URL of Foundry's Install Module section:
``https://raw.githubusercontent.com/mordachai/fu-ace-cards/refs/heads/main/module.json``
_______________________________
## Setup
### 1. Choose a deck for each player with Magic Cards

To create a deck, just drag from the compendium to the Card Stack area in the right side panel.

![image](https://github.com/user-attachments/assets/db8d18a4-75ca-4697-b89f-45bfe13a5323)

Choose one of the <del>3 decks</del> **4 decks** available:
- Elemental Deck: Artistic four elements cards specially created for the Ace of Cards class. 
- Foundry Light: based on Foundry's Poker Cards deck.
- Suits Deck: classical  poker suits, with elemental motifs.
- **NEW!** FU Deck: Fabula Ultima elements. Including the Air Bananas!

Or create your own using Foundry's deck tools and components. Decks can be the same or different from each other, the important part is that each player who has Magic Cards has their own deck.

NOTE: It's a good idea to add the player's name to the deck's name to keep track easily.

### 2. Create Hand and Discard for each player with Magic Cards

Still on the Card Stack menu, create a Hand object (HAND) and a Discard Pile object (PILE). In the same way, name them accordingly.

You will note that a Table component is already there. Assign OWNER to any player with the Magical Cards skill and leave the rest as OBSERVER so they can see the cards played on the table.

![image](https://github.com/user-attachments/assets/0abc148c-7c57-4cc8-9baa-dcb171a4a88f)

### 3. Module Configuration
In the Configure Settings section, in the Fabula ultima: Ace of Cards entry:
Go to the Deck Configuration and assign the correct Deck, Hand, and Discard for the player(s). Ignore any players that does not have the Magic Cards skill.

![image](https://github.com/user-attachments/assets/9762caa6-fd07-4dea-9278-e8ff1bf26931)

Save and reload the canvas (F5). If the players don't see changes, make them reload, too.

That's it, let's play.
_______________________________
## Areas and Controls
#### Table (top)
Cards placed there are visible to everyone (if they have at least the Observer permission).
Click on the handle to open and close, a counter shows how many cards there are.


![image](https://github.com/user-attachments/assets/b9e9c9bd-a01e-4b71-9d15-2d7b152dcf20)


#### Hand (bottom, only for players)
Only visible for players with Magic Cards/Decks. There are three controls there:
- Draw Cards: Draw one card from the deck into the hand.
- Mulligan: Allow the player to discard one card that will be automatically replaced
- Shuffle Deck: Use at the end of the conflict to retrieve all cards.
_______________________________

## How to play:
**Draw your hand**
Click the buttons to send a set to the Table, or click on individual cards and send them one-to-one to form a set there.

![image](https://github.com/user-attachments/assets/ae791ded-10b7-4d85-86f8-ec66fb4431e9)

**JOKERS CAN BE ANY CARD**: ***right click*** over a joker in your hand and select its suit and value.

**Table**: discard cards, resolve sets.
- Resolve sets and send them to the chat window using the set buttons.
- Discard the cards (remember to pay the MP cost, no cheating!
- Get a card back into your hand by clicking on it.
_______________________________
## Chat window:
Use the buttons in the chat card roll to apply damage to targeted tokens and spent MP costs automatically
Some sets ask you to click on a card to select the damage type 
Target tokens to automatically apply damage or healing to multiple targets. As some effects involve splitting damage/healing and effects, a dialog will open to help with the splitting.

[Ace of Cards - Split Damage.webm](https://github.com/user-attachments/assets/76684803-c492-4ee8-bd1b-f0c363840f6c)

## Known Issues
Sometimes after you configure everything the player don't see her/his hand. Remember to update the GM screen and ask the player to update her/his too (F5 in Windows systems).

## Fabula Ultima System:

Created by Emanuele Galletto
Published by Need Games
Ace of Cards class design by Emanuele Galletto

### License
This project is licensed under the MIT License - see the LICENSE file for details.


