# Death and match recap

The recap is a view of match facts. [recap.js](../src/plugins/moba/recap.js) keeps one run's totals; [menu.js](../src/plugins/moba/menu.js) owns its lifetime, pause and result actions. Restart and Back dispose the card, its listeners and desaturation before another mode starts.

Death desaturates the world canvas but keeps the HUD and camera live. The local card names the killer and shows the latest damage events, newest first. Hero sources are registered from the live roster, including Try Mode spawns; minions, structures and training dummies have their own names. Clearing a hero does not erase damage already credited to it. Its countdown uses the render-interpolated respawn tick. Arrows or mouse edges pan while dead; the controller's left stick pans and its click centres. Respawn removes the card and restores colour.

The result screen groups every hero under Your team or Enemy team. Kills credit the hero who dealt the lethal hit; minion and structure kills do not count as hero kills. Damage totals count HP removed from heroes or structures, including the Ball. Again restarts the same setup, including hero, difficulty and seed; Back returns to mode selection. Keyboard, pointer and controller share the sticker actions.

XP contribution is earned team XP attributed once: siege and takedowns credit the hero killer; minion soak splits equally among nearby living heroes. Passive trickle and kills made entirely by lane units have no hero contribution. [lane.js](../src/plugins/moba/lane.js) emits this attribution on the XP fact. [sim.js](../src/plugins/moba/sim.js) caps hit damage to HP actually removed; the farm log consumes that same field without reconstructing health.
