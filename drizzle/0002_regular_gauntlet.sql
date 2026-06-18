CREATE TABLE `onedrive_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerKey` varchar(64) NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`fileItemId` varchar(256) NOT NULL DEFAULT '',
	`sharingUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `onedrive_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `onedrive_tokens_ownerKey_unique` UNIQUE(`ownerKey`)
);
