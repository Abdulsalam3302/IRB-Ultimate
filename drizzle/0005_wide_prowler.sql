ALTER TABLE `applications` ADD `proceedDespiteStage1` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `applications` ADD `proceedDespiteStage1Reason` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `proceedDespiteStage2` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `applications` ADD `proceedDespiteStage2Reason` text;