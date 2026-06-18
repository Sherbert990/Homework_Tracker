CREATE TABLE `activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('onedrive_sync','reminder') NOT NULL,
	`status` enum('success','error','skipped') NOT NULL,
	`message` text NOT NULL,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
