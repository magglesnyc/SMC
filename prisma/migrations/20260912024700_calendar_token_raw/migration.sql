-- Rename tokenHash to token: calendar links are stored as private addresses.
ALTER TABLE "CalendarToken" RENAME COLUMN "tokenHash" TO "token";
ALTER INDEX "CalendarToken_tokenHash_key" RENAME TO "CalendarToken_token_key";
