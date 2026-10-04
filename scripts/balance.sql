-- Run from the repository root: bun run balance (DuckDB CLI, no database file).
-- Every aggregate is partitioned by run, commit and tuning; legacy logs stay individual.
-- Explicit projection keeps empty/all-null fact columns and large logs readable.
CREATE TEMP TABLE logs AS
SELECT * FROM read_json('runs/*/*.jsonl', format = 'newline_delimited', columns = {
    tick: 'BIGINT', match_id: 'VARCHAR', seed: 'UBIGINT', seat: 'VARCHAR',
    hero: 'VARCHAR', team: 'VARCHAR', kind: 'VARCHAR', target: 'VARCHAR',
    effective_damage: 'DOUBLE', ability_id: 'VARCHAR',
    roster: 'STRUCT(id VARCHAR, team VARCHAR, heroId VARCHAR)[]',
    difficulty: 'VARCHAR', map: 'VARCHAR', winner: 'VARCHAR',
    duration: 'DOUBLE', reason: 'VARCHAR',
    run_id: 'VARCHAR', commit: 'VARCHAR', tune_hash: 'VARCHAR'
});
CREATE TEMP VIEW matches AS
SELECT * REPLACE (
    coalesce(run_id, 'legacy:' || match_id) AS run_id,
    coalesce(commit, 'unknown') AS commit,
    coalesce(tune_hash, 'unknown') AS tune_hash
) FROM logs WHERE kind = 'match';
SELECT DISTINCT run_id, commit, tune_hash FROM matches ORDER BY run_id, commit, tune_hash;
CREATE TEMP VIEW seats AS
SELECT m.match_id, m.run_id, m.commit, m.tune_hash, m.difficulty, m.map, m.duration, m.winner,
       r.id AS seat, r.team, r.heroId AS hero
FROM matches m, unnest(m.roster) AS roster(r);

SELECT 'Win rate per hero (hero/team appearances; mirrors count on both sides)' AS report;
WITH appearances AS (
    SELECT DISTINCT match_id, run_id, commit, tune_hash, difficulty, map, hero, team, winner FROM seats
)
SELECT run_id, commit, tune_hash, difficulty, map, hero, count(*) AS appearances,
       count(*) FILTER (WHERE winner IS NOT NULL) AS decided,
       count(*) FILTER (WHERE winner = team) AS wins,
       round(100.0 * count(*) FILTER (WHERE winner = team) /
             nullif(count(*) FILTER (WHERE winner IS NOT NULL), 0), 1) AS win_pct
FROM appearances GROUP BY ALL ORDER BY run_id, commit, tune_hash, difficulty, map, hero;

SELECT 'Win rate per ordered team matchup' AS report;
CREATE TEMP VIEW kits AS
SELECT match_id, team, string_agg(hero || 'x' || copies, '+' ORDER BY hero) AS kit
FROM (SELECT match_id, team, hero, count(*) AS copies FROM seats GROUP BY ALL)
GROUP BY match_id, team;
SELECT m.run_id, m.commit, m.tune_hash, m.difficulty, m.map, a.kit AS team_kit, b.kit AS opponent,
       count(*) AS appearances,
       count(*) FILTER (WHERE m.winner IS NOT NULL) AS decided,
       round(100.0 * count(*) FILTER (WHERE m.winner = a.team) /
             nullif(count(*) FILTER (WHERE m.winner IS NOT NULL), 0), 1) AS win_pct
FROM matches m JOIN kits a USING (match_id)
JOIN kits b ON b.match_id = a.match_id AND b.team <> a.team
GROUP BY ALL ORDER BY m.run_id, m.commit, m.tune_hash, m.difficulty, m.map, team_kit, opponent;

SELECT 'Effective damage per ability per hero-seat minute (all targets, including creeps/structures)' AS report;
WITH minutes AS (
    SELECT run_id, commit, tune_hash, difficulty, map, hero, sum(duration) / 60.0 AS seat_minutes FROM seats GROUP BY ALL
)
SELECT m.run_id, m.commit, m.tune_hash, m.difficulty, m.map, l.hero, l.ability_id,
       round(sum(l.effective_damage), 1) AS damage,
       round(sum(l.effective_damage) / nullif(p.seat_minutes, 0), 1) AS damage_per_minute
FROM logs l JOIN matches m USING (match_id)
JOIN minutes p ON p.hero = l.hero AND p.difficulty = m.difficulty AND p.map = m.map
    AND p.run_id = m.run_id AND p.commit = m.commit AND p.tune_hash = m.tune_hash
WHERE l.kind = 'hit' AND l.seat IS NOT NULL
GROUP BY m.run_id, m.commit, m.tune_hash, m.difficulty, m.map, l.hero, l.ability_id, p.seat_minutes
ORDER BY m.run_id, m.commit, m.tune_hash, m.difficulty, m.map, l.hero, damage_per_minute DESC;

SELECT 'Kill participation (hero deaths; killer or effective hit in preceding 10s of this life)' AS report;
CREATE TEMP VIEW deaths AS
SELECT l.match_id, l.tick, l.target, l.seat AS killer,
       CASE victim.team WHEN 'A' THEN 'B' ELSE 'A' END AS team,
       lag(l.tick, 1, -1) OVER (PARTITION BY l.match_id, l.target ORDER BY l.tick) AS previous_death
FROM logs l JOIN seats victim ON victim.match_id = l.match_id AND victim.seat = l.target
WHERE l.kind = 'death';
CREATE TEMP VIEW participation AS
SELECT DISTINCT d.match_id, d.tick, d.target, d.team, h.seat
FROM deaths d JOIN logs h ON h.match_id = d.match_id AND h.target = d.target
    AND h.kind = 'hit' AND h.effective_damage > 0 AND h.team = d.team AND h.seat IS NOT NULL
    AND h.tick BETWEEN d.tick - 600 AND d.tick AND h.tick > d.previous_death
UNION
SELECT match_id, tick, target, team, killer AS seat FROM deaths WHERE killer IS NOT NULL;
WITH team_kills AS (
    SELECT match_id, team, count(*) AS kills FROM deaths GROUP BY ALL
), involved AS (
    SELECT match_id, seat, count(*) AS kills FROM participation GROUP BY ALL
)
SELECT s.run_id, s.commit, s.tune_hash, s.difficulty, s.map, s.hero, sum(coalesce(i.kills, 0)) AS participated,
       sum(coalesce(t.kills, 0)) AS team_kills,
       round(100.0 * sum(coalesce(i.kills, 0)) / nullif(sum(coalesce(t.kills, 0)), 0), 1) AS participation_pct
FROM seats s LEFT JOIN team_kills t ON t.match_id = s.match_id AND t.team = s.team
LEFT JOIN involved i ON i.match_id = s.match_id AND i.seat = s.seat
GROUP BY s.run_id, s.commit, s.tune_hash, s.difficulty, s.map, s.hero
ORDER BY s.run_id, s.commit, s.tune_hash, s.difficulty, s.map, s.hero;

SELECT 'Match length (timeouts included and counted explicitly)' AS report;
SELECT run_id, commit, tune_hash, difficulty, map, count(*) AS matches, count(*) FILTER (WHERE winner IS NULL) AS unfinished,
       round(min(duration) / 60, 2) AS min_minutes,
       round(avg(duration) / 60, 2) AS mean_minutes,
       round(median(duration) / 60, 2) AS median_minutes,
       round(max(duration) / 60, 2) AS max_minutes
FROM matches GROUP BY ALL ORDER BY run_id, commit, tune_hash, difficulty, map;

SELECT 'Side bias (decided matches only)' AS report;
SELECT run_id, commit, tune_hash, difficulty, map, count(*) AS matches,
       count(*) FILTER (WHERE winner IS NOT NULL) AS decided,
       count(*) FILTER (WHERE winner = 'A') AS a_wins,
       count(*) FILTER (WHERE winner = 'B') AS b_wins,
       round(100.0 * count(*) FILTER (WHERE winner = 'A') /
             nullif(count(*) FILTER (WHERE winner IS NOT NULL), 0), 1) AS a_win_pct
FROM matches GROUP BY ALL ORDER BY run_id, commit, tune_hash, difficulty, map;
