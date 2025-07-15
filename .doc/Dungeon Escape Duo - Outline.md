

## **Project "Dungeon Escape Duo" \- Game Design Outline**

### **1\. High-Level Summary**

**Dungeon Escape Duo** is a 2-player, turn-based cooperative puzzle game designed for the web. The core experience revolves around communication and teamwork. Two players must navigate a grid-based dungeon, using special items to overcome environmental hazards. The key challenge is that each player's item is hidden from their partner, forcing them to talk through their actions to solve puzzles and reach the exit together.  
---

### **2\. Core Components**

#### **Gameplay Mechanics**

* **Player Control:** 2 players (e.g., a **Knight** and a **Mage**).  
* **Environment:** A 2D grid representing a dungeon. Tiles include floor, walls, an exit, and hazards.  
* **Hazards:**  
  * **Fire Hazard:** Blocks movement.  
  * **Chasm:** Blocks movement.  
* **Items & Actions:** On each turn, players are assigned an item.  
  * **"Douse Fire" spell/potion:** Clears an adjacent Fire Hazard, turning it into a floor tile.  
  * **"Build Bridge" spell/item:** Bridges an adjacent Chasm, turning it into a floor tile.  
* **Key Twist:** Players can see their own item but not their partner's. Success requires verbal communication.  
* **Turn Structure:** On a player's turn, they can either **move one space** (up, down, left, or right) or **use their item** on an adjacent tile.

#### **Progression**

* The game uses **leveling**. Players will progress through a series of maps with increasing difficulty and more complex puzzle layouts.

#### **Technical Specifications**

* **Platform:** Browser-Based  
* **Language:** JavaScript  
* **Engine:** Phaser 3  
* **Networking:** Socket.io

#### **Development Strategy**

* **Function First, Art Last:** Initial development will use simple geometric placeholders (e.g., colored squares) for all characters, items, and tiles. This prioritizes building a functional and fun core game loop. Final art assets will be created and integrated at the end of the week for polish.