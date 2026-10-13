import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeGMDifficulty,
  resolveGMDifficulty,
  getGMDifficulty,
  difficultyFlags,
  saveGMDifficulty,
  annotateGMDifficulty,
  refreshRollDifficulty
} from "../../../module/services/gm-difficulty.js";

const id = "l5r4-enhanced";
beforeEach(() => {
  vi.stubGlobal("game", {
    user: { isGM: true },
    settings: { get: vi.fn(() => ({ enabled: true, tn: 25 })), set: vi.fn() }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("GM difficulty", () => {
  it("normalizes bad input to a positive integer", () => {
    expect(normalizeGMDifficulty({ enabled: true, tn: "25.9" })).toEqual({ enabled: true, tn: 25 });
    expect(normalizeGMDifficulty({ tn: -3 }).tn).toBe(1);
    expect(normalizeGMDifficulty({ tn: Infinity }).tn).toBe(15);
    expect(normalizeGMDifficulty(null)).toEqual({ enabled: false, tn: 15 });
  });
  it("overrides automatic and manual base TN only while enabled", () => {
    expect(resolveGMDifficulty(5)).toBe(25);
    expect(resolveGMDifficulty(45, { enabled: false, tn: 25 })).toBe(45);
    game.settings.get.mockImplementation(() => {
      throw Error("not registered");
    });
    expect(getGMDifficulty().enabled).toBe(false);
  });
  it("only allows a GM to save", async () => {
    game.user.isGM = false;
    expect(await saveGMDifficulty({ enabled: true, tn: 99 })).toBe(false);
    expect(game.settings.set).not.toHaveBeenCalled();
    game.user.isGM = true;
    expect(await saveGMDifficulty({ enabled: true, tn: 30 })).toBe(true);
    expect(game.settings.set).toHaveBeenCalledWith(id, "gmDifficulty", { enabled: true, tn: 30 });
  });
  it("preserves other message flags and snapshots the effective TN", () => {
    const config = { enabled: true, tn: 25 };
    const flags = difficultyFlags(config, 35, {
      [id]: { weaponId: "katana" },
      other: { test: true }
    });
    config.tn = 100;
    expect(flags[id]).toEqual({
      weaponId: "katana",
      gmDifficulty: { enabled: true, tn: 25, effective: 35 }
    });
    expect(flags.other.test).toBe(true);
  });
  it("annotates native rolls without changing their visibility or totals", () => {
    const msg = {
      rolls: [{ total: 24 }, { total: 25 }],
      content: "Roll",
      flags: {},
      updateSource: vi.fn()
    };
    annotateGMDifficulty(msg);
    const update = msg.updateSource.mock.calls[0][0];
    expect(update.content).toContain("Échec — 24 / ND 25");
    expect(update.content).toContain("Réussite — 25 / ND 25");
    expect(update).not.toHaveProperty("rolls");
    expect(update).not.toHaveProperty("whisper");
    expect(update).not.toHaveProperty("blind");
  });
  it("does not re-evaluate specialized rolls or activate an already-started disabled roll", () => {
    const msg = {
      rolls: [{ total: 26 }],
      content: '<div class="l5r4-tn-result">Échec ND 35</div>',
      flags: difficultyFlags({ enabled: true, tn: 25 }, 35),
      updateSource: vi.fn()
    };
    annotateGMDifficulty(msg);
    expect(msg.updateSource.mock.calls[0][0].content).not.toContain("Réussite");
    msg.flags = difficultyFlags({ enabled: false, tn: 15 }, 0);
    msg.updateSource.mockClear();
    annotateGMDifficulty(msg);
    expect(msg.updateSource).not.toHaveBeenCalled();
  });
  it("locks an open player's TN and restores it when disabled", () => {
    const root = document.createElement("div");
    root.className = "l5r4-roll-dialog";
    root.innerHTML = '<div class="window-content"><input name="tn" value="10"></div>';
    const input = root.querySelector("input");
    refreshRollDifficulty({ element: root });
    expect(input.value).toBe("25");
    expect(input.readOnly).toBe(true);
    game.settings.get.mockReturnValue({ enabled: false, tn: 25 });
    refreshRollDifficulty({ element: root });
    expect(input.value).toBe("10");
    expect(input.readOnly).toBe(false);
    expect(root.querySelector('[role="status"]')).toBeNull();
  });
});
