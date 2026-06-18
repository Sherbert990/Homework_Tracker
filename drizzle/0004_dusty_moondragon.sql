CREATE TABLE `homework_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`tasks` text NOT NULL,
	`daily_total` int NOT NULL DEFAULT 0,
	`spent` int NOT NULL DEFAULT 0,
	`balance` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `homework_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `homework_entries_date_unique` UNIQUE(`date`)
);
