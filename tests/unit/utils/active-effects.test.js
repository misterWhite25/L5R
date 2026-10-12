import { describe, it, expect } from "vitest";
import { effectChanges, isAdditiveChange } from "../../../module/utils/active-effects.js";
import { getCreationFreeBonus } from "../../../module/utils/xp-calculations.js";

describe("v14 effect bonuses", () => {
  it("prefers native changes without reading a deprecated getter", () => {
    const effect = {
      system: { changes: [{ key: "system.traits.agi", type: "add", value: 1 }] },
      get changes() {
        throw new Error("legacy getter accessed");
      }
    };
    expect(effectChanges(effect)).toHaveLength(1);
    expect(isAdditiveChange(effectChanges(effect)[0])).toBe(true);
  });
  it("does not mistake a non-additive native change for a legacy additive one", () => {
    expect(isAdditiveChange({ type: "override", mode: 2 })).toBe(false);
  });
  it("keeps creation XP free bonuses for native and imported effects, ignoring disabled effects", () => {
    const effect = {
      transfer: true,
      system: { changes: [{ key: "system.traits.agi", type: "add", value: 1 }] }
    };
    const actor = {
      getFlag: () => null,
      items: [{ id: "family", type: "family", effects: [effect] }]
    };
    expect(getCreationFreeBonus(actor, "agi")).toBe(1);
    effect.disabled = true;
    expect(getCreationFreeBonus(actor, "agi")).toBe(0);
    effect.disabled = false;
    delete effect.system;
    effect.changes = [{ key: "system.traits.agi", mode: 2, value: 2 }];
    expect(getCreationFreeBonus(actor, "agi")).toBe(2);
  });
});
