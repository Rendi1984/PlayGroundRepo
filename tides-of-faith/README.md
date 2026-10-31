# Tides of Faith

An original 3D god game in a single HTML file. Open `index.html` in a modern browser (needs an internet connection — Three.js is loaded from a CDN).

## What's in it
- **Faith → mana:** every believer prays; the more believers you have, the more mana you get (the HUD shows the rate). Miracles work only inside your influence.
- **Hand of Light (G):** lift villagers and trees and throw them. A villager set down gently in another village moves there; a hard throw hurts and spreads fear. Thrown logs feed building sites.
- **8 miracles:** Rain, Bounty, Heal, Fertility (more children), Joy (a festival) · Fire, Lightning, **Fireball** (press inside your influence, drag to any target, release — reaches villages beyond your borders).
- **Building:** four house styles (hut, stone-and-thatch cottage, stonehouse, timber townhouse), granary, well, garden, shrine, and **new settlements**. Villagers haul wood and build.
- **Villages:** a central plaza with a great statue of the god, bonfires, banners, dirt paths; articulated villagers who farm, chop, build, pray in rings around the statue, dance at festivals, have children who grow up.
- **Happiness:** food, room, wells, gardens, festivals; grief from disasters. Happy villages grow and stay loyal.
- **Ember, your Phoenix:** learns which miracle you use in which situation and starts doing it itself; praise (Z) / scold (X). Its form follows your morality — *Benevolent Guardian*, *Awakening*, *Harbinger of Destruction*.
- **Advisors:** Aurel (light) and Cinder (shadow) comment with opposite advice.
- **Rival god:** the Tidewraith courts villages, attacks yours, and hurls fireballs late in the game.
- **Sound:** generative music that follows your morality, day/night and festivals; synthesized effects, voices and ambience. M / N toggle music / sound.

## Your artwork
Drop these files into `assets/` and the game uses them automatically (otherwise built-in placeholder portraits are drawn):
- `assets/advisor-good.png` — the light advisor portrait
- `assets/advisor-evil.png` — the shadow advisor portrait
- `assets/phoenix.png` — the three-panel phoenix image (good | neutral | evil, left to right)

## Controls
Left click: act · Right drag / WASD: pan · Middle drag / Q E: rotate · R F: tilt · Wheel: zoom · 1–8 miracles · G hand · Space pause · Esc back to hand.
