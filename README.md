# DodgeThis

Choose a difficulty on the court to play solo, or choose **Play online** to play with friends.

## Host or join

1. The host chooses **Create lobby** and shares the displayed code.
2. Friends choose **Join lobby** and enter that code.
3. The host assigns each human to Team A or Team B and sets each team's bot count.
4. Once both teams have a participant, the host chooses **Start match**. First to two round wins wins the match; the host advances between rounds.

| Match                  | Team A              | Team B            |
| ---------------------- | ------------------- | ----------------- |
| Humans versus humans   | Human(s), 0 bots    | Human(s), 0 bots  |
| Cooperate against bots | Both humans, 0 bots | Bots              |
| Mixed teams            | Human(s) and bots   | Human(s) and bots |

WASD moves, mouse aims, hold/release shoots the bow, 1/2 selects bow/bowl, and Space/Shift dashes. Online, Escape opens session controls while the match continues. Solo keeps its pause and difficulty flow.

Settings are fixed during a match. New players join between matches. If a guest leaves, the match is cancelled and scores reset; if the host leaves, the session ends. Rejoining creates a fresh connection.

## Run locally

```sh
bun install
bun run dev --host 0.0.0.0
```

Open the displayed URL. Online play needs internet access for signaling and may need a TURN relay. See [network configuration](docs/network.md) and [verification](docs/verification.md).
