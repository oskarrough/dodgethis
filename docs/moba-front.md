# MOBA front end

```
 screen   splash ──Enter──▶ lobby ──your box fills──▶ crane ▸ descent ──▶ match
 Enter    open tile          walk to your Ready box    swallowed            —
 Esc/B    tiles shake        back to splash            swallowed            pause
 shot     splash ──0.7 s──▶ lobby ──────0.6 s──────▶ apex ──0.8 s fade──▶ gone
            ▲                  │ ▲                                          │
            └──────Esc/B───────┘ └─────────── pause ▸ Hero select ──────────┤
            └─────────────────────── pause/result ▸ Modes ──────────────────┘
```

There are three screens: splash, [lobby](moba-lobby.md) and match. The crane and descent between lobby and match are one camera move, not a screen, and take no input. Each screen gives Enter one meaning. `?mode=moba&play&hero=mitts&bots=hard` skips the front end and cuts straight into the match. `plugins/moba/front/` owns the splash, backdrop, descent and numbers sheet; `lobby.js` owns the lobby. The in-game look is [moba-look.md](moba-look.md).

Nearer layers travel further, so a move reads as a camera, not a slide.

The descent is where one becomes the other: the line thickens and the colours saturate as the camera lands.
