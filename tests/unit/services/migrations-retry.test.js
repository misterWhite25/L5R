import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("../../../module/setup/migrations.js", () => ({ runMigrations: vi.fn() }));
import { ensureSystemMigration } from "../../../module/setup/migration-runner.js";
import { hasBeenMigrated, markAsMigrated } from "../../../module/setup/migrations/utils/helpers.js";
import {
  applySchemaMapToDocs,
  buildSchemaUpdate
} from "../../../module/setup/migrations/schema/schema-apply.js";

let settings;
beforeEach(() => {
  settings = { runMigration: true, forceMigration: false, lastMigratedVersion: "3.2.0" };
  vi.stubGlobal("game", {
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } },
    system: { version: "3.3.0-beta.1" },
    settings: {
      get: (_id, key) => settings[key],
      set: vi.fn(async (_id, key, value) => {
        settings[key] = value;
      })
    }
  });
  vi.stubGlobal("foundry", {
    utils: {
      deepClone: structuredClone,
      isNewerVersion: (a, b) => a.localeCompare(b, undefined, { numeric: true }) > 0
    }
  });
  vi.stubGlobal("ui", { notifications: { error: vi.fn() } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Migration checkpoints", () => {
  it("keeps the old checkpoint on failure and retries successfully", async () => {
    const migrate = vi.fn().mockRejectedValueOnce(Error("disk full")).mockResolvedValueOnce();
    expect(await ensureSystemMigration(migrate)).toBe(false);
    expect(settings.lastMigratedVersion).toBe("3.2.0");
    expect(await ensureSystemMigration(migrate)).toBe(true);
    expect(migrate).toHaveBeenCalledTimes(2);
    expect(settings.lastMigratedVersion).toBe("3.3.0-beta.1");
    expect(await ensureSystemMigration(migrate)).toBe(false);
  });
  it("keeps forced retries even at the current version", async () => {
    settings.lastMigratedVersion = game.system.version;
    settings.forceMigration = true;
    expect(await ensureSystemMigration(vi.fn().mockRejectedValue(Error("write failed")))).toBe(
      false
    );
    expect(settings.forceMigration).toBe(true);
    expect(await ensureSystemMigration(vi.fn())).toBe(true);
    expect(settings.forceMigration).toBe(false);
  });
  it("does not migrate as player, inactive GM or with migration disabled", async () => {
    const migrate = vi.fn();
    game.user.isGM = false;
    await ensureSystemMigration(migrate);
    game.user.isGM = true;
    game.users.activeGM.id = "other";
    await ensureSystemMigration(migrate);
    game.users.activeGM.id = "gm";
    settings.runMigration = false;
    await ensureSystemMigration(migrate);
    expect(migrate).not.toHaveBeenCalled();
  });
  it("does not hide schema or marker write errors", async () => {
    const doc = {
      documentName: "Actor",
      type: "pc",
      system: { shadow_taint: 2 },
      update: vi.fn().mockRejectedValue(Error("denied")),
      setFlag: vi.fn().mockRejectedValue(Error("marker failed"))
    };
    await expect(applySchemaMapToDocs([doc], "test")).rejects.toThrow("denied");
    await expect(markAsMigrated(doc, "3.3.0")).rejects.toThrow("marker failed");
  });
  it("compares versions numerically", () => {
    expect(
      hasBeenMigrated({ flags: { "l5r4-enhanced": { migratedVersion: "3.9.0" } } }, "3.10.0")
    ).toBe(false);
    expect(
      hasBeenMigrated({ flags: { "l5r4-enhanced": { migratedVersion: "3.10.0" } } }, "3.9.0")
    ).toBe(true);
  });
  it("uses stored values and removes legacy keys without persisting prepared bonuses", () => {
    const doc = {
      documentName: "Actor",
      type: "pc",
      _source: { system: { shadow_taint: 2 } },
      system: { shadowTaint: 7, traits: { agi: 99 } }
    };
    expect(buildSchemaUpdate(doc)).toEqual({
      "system.shadowTaint": 2,
      "system.-=shadow_taint": null
    });
  });
  it("does not mistake an inherited token checkpoint for a token migration", () => {
    const doc = {
      isToken: true,
      flags: { "l5r4-enhanced": { migratedVersion: "3.3.0" } },
      token: { delta: { _source: { flags: {} } } }
    };
    expect(hasBeenMigrated(doc, "3.3.0")).toBe(false);
    doc.token.delta._source.flags = doc.flags;
    expect(hasBeenMigrated(doc, "3.3.0")).toBe(true);
  });
});
