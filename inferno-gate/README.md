# Inferno Gate

A Doom-style (1993) first-person shooter that runs in the browser, built on a real 3D engine (WebGL / three.js).
All the textures, sprites, sounds and music are generated in code. Nothing is taken from the original game.

## How to run
Open `index.html` in a browser (double-click). It works offline: three.js is bundled in `js/three.min.js`.
The previous version (a single-file raycaster) is kept in `classic.html`.

## Controls
| Action | Key |
|---|---|
| Move | W A S D |
| Look in every direction | Mouse (click the screen for pointer lock) or the arrow keys |
| Fire | Left click / F |
| Aim down sights (zoom, no spread) | Hold right click |
| Crouch (hide behind cover) | Hold C |
| Jump | Space |
| Run | Shift |
| Open door / flip switch | E |
| Weapons | 1–6 or the mouse wheel |
| Automap | Tab |
| Pause and menu | Esc / P |
| Music | M |

On a phone, a joystick and on-screen buttons appear, including crouch and aim toggles and ☰ for the menu.

## Menus
- **Main menu:** new game with a difficulty level (easy / normal / hard), options, how to play, controls
- **Pause menu (Esc):** resume, options, how to play, controls, restart the level, quit to the main menu
- **Options:** mouse sensitivity, field of view, invert Y, auto-aim, brightness, graphics quality, camera bob, FPS counter, effects and music volume. Saved in the browser

## What's in it
- **Engine:** areas with floor and ceiling heights (stairs, platforms, unreachable ledges), open sky, Doom-style rising doors
- **Cover:** wooden crates, concrete barriers and tall crate stacks. They stop bullets, projectiles and line of sight, so crouching behind a low one hides you from monsters
- **Post-processing:** bloom around bright light sources, a soft tone curve, colour grading and fine film grain. Bullet holes, scorch marks and blood stay on walls and floors
- **Lighting:** baked static light with shadows, plus up to 8 dynamic lights (muzzle flashes, projectiles, explosions)
- **Textures:** generated 256px textures with relief (normal maps), gloss maps for highlights, edge wear, grime streaks and emissive parts. Corner shading (ambient occlusion) is baked into the walls
- **Levels:** 3 levels, red and blue keys, liquids that damage you, an exit switch, and a stats screen
- **3D models:** monsters with walk, attack and death animation (a falling body, a mouth that opens), spinning items, and a first-person weapon with hands whose fingers wrap the grips
- **Monsters (8):** soldier, shotgun sergeant, imp, demon, spectre (semi-invisible), lost soul (charging skull), cacodemon, baron.
  Monsters fight each other when they hit one another by accident
- **Weapons (6):** fist, pistol, shotgun, chaingun, rocket launcher (splash damage), plasma rifle
- **Effects:** blood, sparks and smoke particles, exploding barrels with chain reactions, and automatic resolution scaling for weak devices

## Code layout
`js/core.js` math, noise and drawing helpers · `js/textures.js` textures and sky · `js/sprites.js` monster and item art ·
`js/levels.js` maps · `js/world.js` geometry, lighting and shaders · `js/models.js` 3D models and hands · `js/post.js` bloom and colour · `js/audio.js` sound · `js/hud.js` weapon and status bar · `js/game.js` logic and AI
