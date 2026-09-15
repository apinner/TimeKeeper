-- Switch identity from Microsoft Entra ID to Active Directory over LDAP.
--
-- Written by hand rather than generated, so that the Entra object id column is
-- renamed and its values kept, instead of being dropped and recreated.

-- Keep existing accounts: the column changes meaning, not content. Values are
-- Entra object ids and will be replaced by directory GUIDs on next sign-in.
ALTER TABLE "User" RENAME COLUMN "entraObjectId" TO "directoryId";
ALTER INDEX "User_entraObjectId_key" RENAME TO "User_directoryId_key";

-- Distinguished name, used to resolve the manager attribute to a person.
ALTER TABLE "User" ADD COLUMN "directoryDn" TEXT;

-- Auth.js adapter columns and tables. Sessions are now signed cookies, so these
-- hold nothing worth keeping; everyone is signed out by this migration.
ALTER TABLE "User" DROP COLUMN "emailVerified";
ALTER TABLE "User" DROP COLUMN "image";

DROP TABLE IF EXISTS "Account";
DROP TABLE IF EXISTS "Session";
DROP TABLE IF EXISTS "VerificationToken";
