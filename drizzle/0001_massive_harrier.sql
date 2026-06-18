CREATE TABLE `reminder_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`reminderTime` varchar(5) NOT NULL DEFAULT '20:00',
	`method` enum('email','sms','both','none') NOT NULL DEFAULT 'email',
	`email` varchar(320) NOT NULL DEFAULT '',
	`phone` varchar(32) NOT NULL DEFAULT '',
	`message` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reminder_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `reminder_settings_openId_unique` UNIQUE(`openId`)
);
