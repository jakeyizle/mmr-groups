ALTER TABLE `groups` ADD `hidden_from_index` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `player_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `match_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `last_played_at` text;
--> statement-breakpoint
-- Public index counters (PLAN §5): triggers keep them current for every write, raw SQL included.
-- Drizzle doesn't know about triggers: rebuilding players or matches in a later migration drops them.
CREATE TRIGGER `players_count_insert` AFTER INSERT ON `players` BEGIN UPDATE groups SET player_count = (SELECT count(*) FROM players WHERE group_id = NEW.group_id) WHERE id = NEW.group_id; END;
--> statement-breakpoint
CREATE TRIGGER `players_count_delete` AFTER DELETE ON `players` BEGIN UPDATE groups SET player_count = (SELECT count(*) FROM players WHERE group_id = OLD.group_id) WHERE id = OLD.group_id; END;
--> statement-breakpoint
CREATE TRIGGER `matches_count_insert` AFTER INSERT ON `matches` BEGIN UPDATE groups SET match_count = (SELECT count(*) FROM matches WHERE group_id = NEW.group_id), last_played_at = (SELECT max(played_at) FROM matches WHERE group_id = NEW.group_id) WHERE id = NEW.group_id; END;
--> statement-breakpoint
CREATE TRIGGER `matches_count_delete` AFTER DELETE ON `matches` BEGIN UPDATE groups SET match_count = (SELECT count(*) FROM matches WHERE group_id = OLD.group_id), last_played_at = (SELECT max(played_at) FROM matches WHERE group_id = OLD.group_id) WHERE id = OLD.group_id; END;
--> statement-breakpoint
CREATE TRIGGER `matches_count_update` AFTER UPDATE OF played_at ON `matches` BEGIN UPDATE groups SET match_count = (SELECT count(*) FROM matches WHERE group_id = NEW.group_id), last_played_at = (SELECT max(played_at) FROM matches WHERE group_id = NEW.group_id) WHERE id = NEW.group_id; END;
--> statement-breakpoint
UPDATE groups SET player_count = (SELECT count(*) FROM players WHERE group_id = groups.id);
--> statement-breakpoint
UPDATE groups SET match_count = (SELECT count(*) FROM matches WHERE group_id = groups.id), last_played_at = (SELECT max(played_at) FROM matches WHERE group_id = groups.id);
