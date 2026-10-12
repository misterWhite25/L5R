const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const output = path.resolve("test-results/v14");
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  const warnings = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning") warnings.push(m.text());
  });
  try {
    await page.goto(process.env.FOUNDRY_TEST_URL || "http://127.0.0.1:30004");
    const title = await page.locator("body").innerText();
    if (!title.includes("L5R — Démonstration v14") || !title.includes("Version 14"))
      throw Error("Refusing to enter a non-test world");
    await page.locator('input[name="username"]').fill("Gamemaster");
    await page.locator('button[name="join"]').click();
    await page.waitForFunction(() => globalThis.game?.ready, {}, { timeout: 30000 });
    const results = await page.evaluate(async () => {
      const out = [];
      const assert = (v, s) => {
        if (!v) throw Error(s);
      };
      const run = async (name, fn) => {
        try {
          await fn();
          out.push({ name, pass: true });
        } catch (e) {
          out.push({ name, pass: false, error: e.stack });
        }
      };
      assert(
        game.world.id === "l5r-v14-demo" && game.release.generation === 14,
        "Wrong test world/runtime"
      );
      const base = "/systems/l5r4-enhanced/";
      const fixtures = await import(base + "tests/fixtures/actor-fixtures.js");
      const items = await import(base + "tests/fixtures/item-fixtures.js");
      for (const a of game.actors.filter(a => a.getFlag("l5r4-enhanced", "v14Test")))
        await a.delete();
      const pc = await fixtures.createTestPC({
        name: "Akodo Haru — Démonstration",
        flags: { "l5r4-enhanced": { v14Test: true } },
        system: { traits: { agi: 3, ref: 3 }, rings: { void: { rank: 2, value: 2 } } }
      });
      const npc = await fixtures.createTestNPC({
        name: "Bandit — Démonstration",
        flags: { "l5r4-enhanced": { v14Test: true } }
      });
      globalThis.l5rTest = { pc, npc };
      await run("PC/NPC creation and sheets", async () => {
        for (const a of [pc, npc]) {
          await a.sheet.render(true);
          assert(a.sheet.element?.querySelector("input"), "Sheet has no input");
          await a.sheet.close();
        }
      });
      await run("Every item type and sheet", async () => {
        for (const type of Object.keys(game.system.documentTypes.Item)) {
          const item = await Item.create({ name: "Test " + type, type });
          try {
            await item.sheet.render(true);
            assert(item.sheet.element, "No item sheet " + type);
            await item.sheet.close();
          } finally {
            await item.delete();
          }
        }
      });
      const [skill, weapon] = await pc.createEmbeddedDocuments("Item", [
        items.createSkillData("Kenjutsu", 3, "agi"),
        items.createWeaponData("Katana", 3, 2)
      ]);
      await run("Embedded item persistence and derived dice", async () => {
        await skill.update({ "system.rank": 4 });
        assert(skill.system.rank === 4, "Skill not saved");
        assert(skill.system.rollDice > 0, "Skill dice not prepared");
      });
      await run("Native v14 effects: transfer, family and XP bonus", async () => {
        const [family] = await pc.createEmbeddedDocuments("Item", [
          {
            name: "Famille de test",
            type: "family",
            effects: [
              {
                name: "Agilité +1",
                transfer: true,
                system: {
                  changes: [{ key: "system.traits.agi", type: "add", value: 1, phase: "initial" }]
                }
              }
            ]
          }
        ]);
        await pc.setFlag("l5r4-enhanced", "familyItemUuid", family.uuid);
        const { FamilyBonusService } = await import(
          base + "module/services/family-bonus-service.js"
        );
        const { getCreationFreeBonus } = await import(base + "module/utils/xp-calculations.js");
        assert(FamilyBonusService.getBonus(pc, "agi") === 1, "Family bonus lost");
        assert(getCreationFreeBonus(pc, "agi") === 1, "XP bonus lost");
        assert(pc.system.traits.agi === 4, "Effect not applied to actor");
        await family.effects.contents[0].update({ disabled: true });
        assert(FamilyBonusService.getBonus(pc, "agi") === 0, "Disabled bonus active");
        assert(pc.system.traits.agi === 3, "Disabled effect still applied");
        await family.delete();
      });
      await run("Stance switching and full defense", async () => {
        await pc.toggleStatusEffect("fullAttackStance", { active: true });
        assert(pc.statuses.has("fullAttackStance"), "Full attack missing");
        await pc.toggleStatusEffect("defenseStance", { active: true });
        await new Promise(r => setTimeout(r, 300));
        assert(
          pc.statuses.has("defenseStance") && !pc.statuses.has("fullAttackStance"),
          "Stances not exclusive"
        );
        await pc.toggleStatusEffect("fullDefenseStance", { active: true });
        await new Promise(r => setTimeout(r, 500));
        assert(pc.statuses.has("fullDefenseStance"), "Full defense missing");
        await pc.deleteEmbeddedDocuments(
          "ActiveEffect",
          pc.effects.map(e => e.id)
        );
      });
      await run("Trait rolls and all message privacy modes", async () => {
        const { TraitRoll } = await import(base + "module/services/dice/rolls/trait-roll.js");
        for (const mode of ["public", "gm", "blind", "self"]) {
          await game.settings.set("core", "messageMode", mode);
          const msg = await TraitRoll({
            actor: pc,
            traitName: "agi",
            traitRank: 3,
            askForOptions: false
          });
          assert(msg?.rolls.length === 1, "No roll " + mode);
          assert(Number.isFinite(msg.rolls[0].total), "Invalid total");
          assert(
            mode === "public" ? msg.whisper.length === 0 : msg.whisper.length > 0,
            "Visibility wrong " + mode
          );
          if (mode === "blind") assert(msg.blind, "Blind flag absent");
        }
      });
      await run("Item chat visibility", async () => {
        await game.settings.set("core", "messageMode", "self");
        const msg = await weapon.roll();
        assert(msg?.whisper.includes(game.user.id), "Item chat privacy lost");
      });
      await game.settings.set("core", "messageMode", "public");
      await run("Skill, weapon damage, ring and spell rolls", async () => {
        await game.settings.set("core", "messageMode", "self");
        const { SkillRoll } = await import(base + "module/services/dice/rolls/skill-roll.js");
        const { WeaponRoll } = await import(base + "module/services/dice/rolls/weapon-roll.js");
        const { RingRoll } = await import(base + "module/services/dice/rolls/ring-roll.js");
        const { SpellCastRoll } = await import(
          base + "module/services/dice/rolls/spell-cast-roll.js"
        );
        for (const message of [
          await SkillRoll({
            actor: pc,
            actorTrait: 3,
            skillRank: 4,
            skillName: "Kenjutsu",
            skillTrait: "agi",
            askForOptions: false
          }),
          await WeaponRoll({
            actor: pc,
            diceRoll: 5,
            diceKeep: 2,
            weaponName: "Katana",
            askForOptions: false
          }),
          await RingRoll({
            actor: pc,
            ringRank: 2,
            ringName: "Fire",
            systemRing: "fire",
            askForOptions: false
          })
        ]) {
          assert(message?.rolls?.length === 1, "Roll missing");
          assert(message.whisper.includes(game.user.id), "Roll privacy lost");
        }
        await pc.update({ "system.spellSlots.fire": 2 });
        const [spell] = await pc.createEmbeddedDocuments("Item", [
          items.createSpellData("Prière de démonstration", "fire", 1)
        ]);
        const msg = await SpellCastRoll({ actor: pc, spell, showDialog: false });
        assert(msg?.rolls?.length === 1, "Spell roll missing");
        assert(pc.system.spellSlots.fire === 1, "Spell slot not consumed");
        await game.settings.set("core", "messageMode", "public");
      });
      await run("Combat initiative", async () => {
        const combat = await Combat.create({
          combatants: [
            { actorId: pc.id, name: pc.name },
            { actorId: npc.id, name: npc.name }
          ]
        });
        try {
          await combat.rollInitiative(combat.combatants.map(c => c.id));
          assert(
            combat.combatants.every(c => Number.isFinite(c.initiative)),
            "Initiative missing"
          );
          await combat.startCombat();
          await combat.nextTurn();
          assert(combat.started, "Combat not started");
        } finally {
          await combat.delete();
        }
      });
      await run("Utility application rendering", async () => {
        for (const file of [
          "wound-config",
          "combat-config",
          "condition-manager",
          "xp-manager",
          "wealth-manager",
          "armor-config"
        ]) {
          const exports = await import(base + "module/apps/" + file + ".js");
          const cls = Object.values(exports).find(v => typeof v === "function");
          const app = new cls(pc);
          try {
            await app.render(true);
            assert(app.element, "No " + file);
          } finally {
            await app.close();
          }
        }
      });
      await pc.sheet.render(true);
      return out;
    });
    async function uiTest(name, fn) {
      try {
        await fn();
        results.push({ name, pass: true });
      } catch (e) {
        results.push({ name, pass: false, error: e.message });
      }
    }
    await page.evaluate(() => {
      for (const n of document.querySelectorAll(".notification.warning"))
        n.querySelector(".close")?.click();
    });
    await uiTest("Trait dialog and Void spending through UI", async () => {
      await page.evaluate(() => {
        const pc = l5rTest.pc;
        globalThis.pendingRoll = import(
          "/systems/l5r4-enhanced/module/services/dice/rolls/trait-roll.js"
        ).then(m => m.TraitRoll({ actor: pc, traitName: "agi", traitRank: 3 }));
      });
      await page.locator('dialog input[name="void"]').check();
      await page.locator('dialog button[data-action="ok"]').click();
      const result = await page.evaluate(async () => {
        const msg = await pendingRoll;
        return { formula: msg.rolls[0].formula, void: l5rTest.pc.system.rings.void.value };
      });
      if (result.void !== 1 || !result.formula.startsWith("4d10"))
        throw Error(JSON.stringify(result));
    });
    await uiTest("Delete item confirmation via DialogV2", async () => {
      await page.evaluate(async () => {
        const pc = l5rTest.pc;
        const [item] = await pc.createEmbeddedDocuments("Item", [
          { name: "Objet temporaire", type: "commonItem" }
        ]);
        const row = document.createElement("div");
        row.className = "item";
        row.dataset.itemId = item.id;
        const button = document.createElement("button");
        row.append(button);
        const { ItemCRUDHandler } = await import(
          "/systems/l5r4-enhanced/module/sheets/handlers/item-crud-handler.js"
        );
        globalThis.deletedTestItem = item.id;
        globalThis.pendingDelete = ItemCRUDHandler.deleteItem(
          { actor: pc },
          { preventDefault() {}, shiftKey: false },
          button
        );
      });
      await page.locator('dialog button[data-action="yes"]').click();
      const gone = await page.evaluate(async () => {
        await pendingDelete;
        return !l5rTest.pc.items.has(deletedTestItem);
      });
      if (!gone) throw Error("Item not deleted");
    });
    await uiTest("Actor data survives browser reload", async () => {
      await page.reload();
      await page.waitForFunction(() => globalThis.game?.ready);
      const saved = await page.evaluate(() => {
        const pc = game.actors.find(a => a.name === "Akodo Haru — Démonstration");
        return {
          void: pc.system.rings.void.value,
          skill: pc.items.find(i => i.name === "Kenjutsu").system.rank
        };
      });
      if (saved.void !== 1 || saved.skill !== 4) throw Error(JSON.stringify(saved));
    });
    await page.evaluate(async () => {
      await game.actors.find(a => a.name === "Akodo Haru — Démonstration").sheet.render(true);
      for (const n of document.querySelectorAll(".notification.warning"))
        n.querySelector(".close")?.click();
    });
    console.log(JSON.stringify(results, null, 2));
    await page.screenshot({ path: path.join(output, "demo.png") });
    console.log("ERRORS", JSON.stringify(errors));
    console.log(
      "WARNINGS",
      JSON.stringify(
        warnings.filter(
          w =>
            !w.includes("hardware acceleration") && !w.includes("Sequencer") && !w.includes("JB2A")
        )
      )
    );
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify({ results, errors, warnings }, null, 2)
    );
    if (results.some(r => !r.pass) || errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
