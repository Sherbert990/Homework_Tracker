CREATE TABLE `backup_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`startedAt` bigint NOT NULL,
	`finishedAt` bigint,
	`status` enum('running','success','failed') NOT NULL DEFAULT 'running',
	`triggeredBy` varchar(32) NOT NULL,
	`uploadedFiles` text,
	`errorMessage` text,
	CONSTRAINT `backup_runs_id` PRIMARY KEY(`id`)
);
