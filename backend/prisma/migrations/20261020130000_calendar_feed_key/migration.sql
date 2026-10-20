-- Subscription feed (fix420, idea 10): the key in a calendar's subscription link. Made on request; renewing it cuts the old links off.
ALTER TABLE "calendars" ADD COLUMN "feedKey" TEXT;
