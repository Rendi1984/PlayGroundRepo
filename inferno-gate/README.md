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
| Turn | Mouse (click the screen for pointer lock) or the arrow keys |
| Fire | Click / Space |
| Open door / flip switch | E |
| Run | Shift |
| Weapons | 1–6 or the mouse wheel |
| Automap | Tab |
| Brightness / music / pause | B / M / P |

On a phone, a joystick and on-screen buttons appear.

## What's in it
- **Engine:** areas with floor and ceiling heights (stairs, platforms, unreachable ledges), open sky, Doom-style rising doors
- **Lighting:** baked static light with shadows, plus up to 8 dynamic lights (muzzle flashes, projectiles, explosions)
- **Textures:** generated textures with relief (normal maps) and emissive parts (lights, signs, nukage and lava)
- **Levels:** 3 levels, red and blue keys, liquids that damage you, an exit switch, and a stats screen
- **Monsters (8):** soldier, shotgun sergeant, imp, demon, spectre (semi-invisible), lost soul (charging skull), cacodemon, baron.
  Monsters fight each other when they hit one another by accident
- **Weapons (6):** fist, pistol, shotgun, chaingun, rocket launcher (splash damage), plasma rifle
- **Effects:** blood, sparks and smoke particles, exploding barrels with chain reactions, and automatic resolution scaling for weak devices

## Code layout
`js/core.js` math, noise and drawing helpers · `js/textures.js` textures and sky · `js/sprites.js` monster and item art ·
`js/levels.js` maps · `js/world.js` geometry, lighting and shaders · `js/audio.js` sound · `js/hud.js` weapon and status bar · `js/game.js` logic and AI
