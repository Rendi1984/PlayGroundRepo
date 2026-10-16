# Inferno Gate

A first-person shooter in the style of Doom (1993), in a single HTML file with no dependencies.
All the textures, sprites, sounds and music are generated in code. Nothing is taken from the original game.

## How to run
Open `index.html` in a browser (double-click). No server needed.

## Controls
| Action | Key |
|---|---|
| Move | W A S D |
| Turn | Mouse (click the screen for pointer lock) or the arrow keys |
| Fire | Click / Space |
| Open door / flip switch | E |
| Run | Shift |
| Weapons | 1 fist · 2 pistol · 3 shotgun · 4 chaingun |
| Automap | Tab |
| Music / pause | M / P |

On a phone, a joystick and on-screen buttons appear.

## What's in it
- Raycasting engine with textured walls, floor and ceiling, distance shading, and sliding doors
- 2 levels (E1M1, E1M2), red key and locked door, exit switch, and an end-of-level stats screen
- Enemies: soldier (hitscan), imp (fireballs), demon (melee), with sight, pain and death states
- Explosive barrels with chain reactions, an automap, and a status bar with a face that reacts to damage
