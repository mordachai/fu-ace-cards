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

![image](https://github.com/user-attachments/assets/db8d18a4-75ca-4697-b89f-45bfe13a5323)

Choose one of the 3 decks available:
- Elemental Deck: Artistic four elements cards specially created for the Ace of Cards class. 
- Foundry Light: based on Foundry's Poker Cards deck.
- Suits Deck: classical  poker suits, with elemental motifs.

Or create your own using Foundry's deck tools and components. Decks can be the same or different from each other, the important part is that each player who has Magic Cards has their own deck.

NOTE: It's a good idea to add the player's name to the deck's name to keep track easily.

### 2. Create Hand and Discard for each player with Magic Cards

Still on the Card Stack menu, create a Hand object (HAND) and a Discard Pile object (PILE). In the same way, name them accordingly.

You will note that there is a Table component already there. Assign OWNER to any player with the Magical Cards skill and leave the rest as OBSERVER.

![image](https://github.com/user-attachments/assets/0abc148c-7c57-4cc8-9baa-dcb171a4a88f)

### 3. Module Configuration
In the Configure Settings section, in the Fabula ultima: Ace of Cards entry:
Go to the Deck Configuration and assign the correct Deck, Hand, and Discard for the player(s). Ignore any players that does not have the Magic Cards skill.

![image](https://github.com/user-attachments/assets/9762caa6-fd07-4dea-9278-e8ff1bf26931)


Save and reload the canvas (F5). If the players don't see changes, make them reload, too.

That's it, let's play.

## Areas and Controls
#### Table (top)
Cards placed there are visible to everyone (if they have at least the Observer permission).
Click on the handle to open and close, a counter shows how many cards there are.

#### Hand (bottom, only for players)
Only visible for players with Magic Cards/Decks. There are three controls there:
- Draw Cards: Draw one card from the deck into the hand.
- Mulligan: Allow the player to discard one card that will be automatically replaced
- Shuffle Deck: Use at the end of the conflict to retrieve all cards.

## How to play:
Draw your hand
Click the buttons to send a set to the Table, or click on individual cards and send them one-to-one to form a set there.
![image](https://github.com/user-attachments/assets/c3152728-63c3-47f1-b143-6caf68ada4c2)


JOKERS CAN BE ANY CARD: click with the right button over a joker in your hand and select its suit and value.
![image](https://github.com/user-attachments/assets/ae791ded-10b7-4d85-86f8-ec66fb4431e9)


Once in the table:
![image](https://github.com/user-attachments/assets/54d505a9-141b-4a76-913d-74502b7977b1)

Discard all table in the button (use it to discard carts without resolving sets, remember to pay their price in MP)
Send sets to the chat window, using the buttons for that
Retrieve a card to hand by clicking on it.


## Chat window:
Use the buttons to spend the set MP cost automatically
Click on the cards to select the effect when its the case (like Magic Pair and Double Trouble) 
Target tokens to automatically apply damage or healing to multiple targets. As some effects involve splitting damage/healing and effects, a dialog will open to help with the splitting.

## Fabula Ultima System:

Created by Emanuele Galletto
Published by Need Games
Ace of Cards class design by Emanuele Galletto

Special Thanks:

The Fabula Ultima community for feedback and testing
Contributors and translators
Need Games for creating this amazing system

### License
This project is licensed under the MIT License - see the LICENSE file for details.


