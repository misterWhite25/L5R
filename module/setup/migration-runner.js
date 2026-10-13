import { SYS_ID } from "../config/constants.js";
import { runMigrations } from "./migrations.js";

/** Only the active GM migrates. Failed writes leave the checkpoint unchanged for retry. */
export async function ensureSystemMigration(migrate = runMigrations) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) {
    return false;
  }
  const version = game.system.version;
  const previous = game.settings.get(SYS_ID, "lastMigratedVersion");
  const force = game.settings.get(SYS_ID, "forceMigration");
  if (!game.settings.get(SYS_ID, "runMigration")) {
    return false;
  }
  if (!force && !foundry.utils.isNewerVersion(version, previous)) {
    return false;
  }
  try {
    await migrate(previous, version);
    await game.settings.set(SYS_ID, "lastMigratedVersion", version);
    if (force) {
      await game.settings.set(SYS_ID, "forceMigration", false);
    }
    return true;
  } catch (error) {
    console.error(`${SYS_ID} | Migration failed; the next launch will retry`, error);
    ui.notifications?.error(
      "La migration L5R a échoué. Consultez la console ; elle sera réessayée à la prochaine connexion du MJ."
    );
    return false;
  }
}
