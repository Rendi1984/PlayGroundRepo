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
- **Villagers:** every believer has a name, age, personality, home and feelings (happiness, faith, health, fear). Houses list their residents; building sites show % progress.
- **Win:** 5 of 7 villages (or the rival has none). **Lose:** no village for 40 seconds. Your first village is protected for the first 4 minutes.
- **Rival god:** the Tidewraith courts villages, attacks yours, and hurls fireballs late in the game.
- **Sound:** generative music that follows your morality, day/night and festivals; synthesized effects, voices and ambience. M / N toggle music / sound.

## Also
- Start: one village each, at opposite ends of a large island — both gods expand by founding settlements.
- 🛡 Shield miracle; ☄️ fireballs are flung with the mouse (predicted arc shown).
- 🌿 Land & Nature: raise land, dig ponds, flatten, move water (scoop from a lake, pour into a new hole), plant trees.
- Trees grow over time and much faster in the rain; chopping shrinks them; bigger trees give more wood.
- 🌽 Fields (double food, harvests), visible village woodpiles, loose logs that villagers fetch.
- Alerts for homeless villagers, hunger, lost villages and incoming fireballs.
- Lightning electrocutes; the dead collapse before fading. Advisors speak with the browser's speech voices (V to toggle).
- Textured stone, plaster, timber, thatch and slate buildings.
- Wildlife: deer and boar herds that graze, flee and breed; hungry villages send hunters for meat.
- Migration: people move to another god's village when life there is clearly better (in both directions).
- Advisor voices prefer the most natural speech voices on the device; pick and test them with the 🗣 button.

## Your artwork
Drop these files into `assets/` and the game uses them automatically (otherwise built-in placeholder portraits are drawn):
- `assets/advisor-good.png` — the light advisor portrait
- `assets/advisor-evil.png` — the shadow advisor portrait
- `assets/phoenix.png` — the three-panel phoenix image (good | neutral | evil, left to right)

## Controls
Click a villager, house or building site: details (name, age, personality, feelings, residents, progress) · Press and drag a villager: throw · **Right click: let go / cancel / close** ·
Left click: act · Right drag / WASD: pan · Middle drag / Q E: rotate · R F: tilt · Wheel: zoom · 1–8 miracles · G hand · Space pause · Esc back to hand.
