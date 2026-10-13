const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const url = process.env.FOUNDRY_ACCEPTANCE_URL || "http://127.0.0.1:30005";
const output = "test-results/acceptance-v14";
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  const results = [],
    errors = [];
  let gm,
    player,
    pcId,
    ids = {};
  const run = async (name, fn) => {
    try {
      await fn();
      results.push({ name, pass: true });
      console.log("PASS", name);
    } catch (e) {
      results.push({ name, pass: false, error: e.stack });
      throw e;
    }
  };
  const login = async name => {
    const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    p.setDefaultTimeout(30000);
    p.on("pageerror", e => errors.push(e.message));
    await p.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
    await p.goto(url + "/join");
    assert(
      (await p.locator("body").innerText()).includes("L5R v14 Acceptance TEST"),
      "Refusing non-test world"
    );
    await p.locator("input[name=username]").fill(name);
    await p.locator("button[name=join]").click();
    if (name !== "Gamemaster") {
      await p.waitForFunction(
        () => globalThis.game?.ready || document.querySelector("form.user-config")
      );
      const save = p.getByRole("button", { name: "Save Player Configuration" });
      if (await save.isVisible()) await save.click();
    }
    await p.waitForFunction(() => globalThis.game?.ready);
    return p;
  };
  try {
    gm = await login("Gamemaster");
    pcId = await gm.evaluate(async () => {
      if (game.world.id !== "l5r-v14-acceptance" || game.release.generation !== 14)
        throw Error("Wrong runtime");
      const user =
        game.users.find(u => u.name === "Acceptance Player") ??
        (await User.create({ name: "Acceptance Player", role: 1 }));
      const f = await import("/systems/l5r4-enhanced/tests/fixtures/actor-fixtures.js");
      const pc = await f.createTestPC({ name: "Acceptance PC", ownership: { [user.id]: 3 } });
      globalThis.acceptance = { pc, user };
      return pc.id;
    });
    await run("Six tools reopen without duplicate windows", () =>
      gm.evaluate(async () => {
        const { AppLauncherHandler: H } = await import(
          "/systems/l5r4-enhanced/module/sheets/handlers/app-launcher-handler.js"
        );
        for (const method of [
          "openArmorConfig",
          "openCombatConfig",
          "openConditionManager",
          "openWoundConfig",
          "openXpManager",
          "openWealthManager"
        ]) {
          const before = new Set(foundry.applications.instances.keys());
          await H[method]({ actor: acceptance.pc });
          const added = [...foundry.applications.instances.values()].filter(
            a => !before.has(a.id) && a.actor?.id === acceptance.pc.id && a.rendered
          );
          if (added.length !== 1) throw Error(method + " first window missing");
          const count = foundry.applications.instances.size;
          await H[method]({ actor: acceptance.pc });
          if (count !== foundry.applications.instances.size) throw Error(method + " duplicated");
          await added[0].close();
        }
      })
    );
    await run("Every actor/item subtype opens, saves and reopens", () =>
      gm.evaluate(async () => {
        const actors = [];
        for (const type of Object.keys(game.system.documentTypes.Actor)) {
          const a = await Actor.create({ name: "Subtype " + type, type });
          actors.push(a);
          await a.sheet.render(true);
          await a.update({ name: "Saved " + type });
          await a.sheet.close();
          await a.sheet.render(true);
          if (!a.sheet.element.querySelector('input[name="name"]'))
            throw Error("No actor name field");
          await a.sheet.close();
        }
        for (const type of Object.keys(game.system.documentTypes.Item)) {
          const i = await Item.create({ name: "Subtype " + type, type });
          await i.sheet.render(true);
          await i.update({ name: "Saved " + type });
          await i.sheet.close();
          await i.sheet.render(true);
          if (i.name !== "Saved " + type) throw Error("Item not saved");
          await i.sheet.close();
          await i.delete();
        }
        for (const a of actors) await a.delete();
      })
    );
    await run("Legacy embedded skills migrate with retry checkpoint", () =>
      gm.evaluate(async () => {
        const id = "l5r4-enhanced",
          pc = acceptance.pc;
        await pc.update({ "system.shadow_taint": 3, "system.-=shadowTaint": null });
        const [skill] = await pc.createEmbeddedDocuments("Item", [
          {
            name: "Legacy skill",
            type: "skill",
            system: { rank: 2, trait: "agi", emphasis: "Acceptance emphasis" }
          }
        ]);
        acceptance.skillId = skill.id;
        const { ensureSystemMigration } = await import(
          "/systems/" + id + "/module/setup/migration-runner.js"
        );
        await game.settings.set(id, "lastMigratedVersion", "3.2.0");
        await game.settings.set(id, "forceMigration", true);
        const write = skill.update.bind(skill);
        skill.update = async () => {
          throw Error("Expected simulated failed write");
        };
        if (await ensureSystemMigration()) throw Error("Failure incorrectly succeeded");
        if (
          game.settings.get(id, "lastMigratedVersion") !== "3.2.0" ||
          !game.settings.get(id, "forceMigration")
        )
          throw Error("Checkpoint advanced on failure");
        skill.update = write;
        if (!(await ensureSystemMigration())) throw Error("Retry failed");
        if (pc._source.system.shadowTaint !== 3 || pc._source.system.shadow_taint !== undefined)
          throw Error("Schema source migration failed");
        if (!skill.system.trainedEmphases.includes("Acceptance emphasis"))
          throw Error("Legacy emphasis missing");
        if (game.settings.get(id, "lastMigratedVersion") !== game.system.version)
          throw Error("Successful checkpoint missing");
      })
    );
    await run("World compendium imports, drops and native legacy effects", () =>
      gm.evaluate(async () => {
        const id = "l5r4-enhanced";
        const pc = acceptance.pc;
        const pack = await CompendiumCollection.createCompendium({
          name: "acceptance-items-" + foundry.utils.randomID().toLowerCase(),
          label: "Acceptance items",
          type: "Item"
        });
        acceptance.packId = pack.collection;
        const item = await Item.create(
          {
            name: "Legacy family",
            type: "family",
            effects: [
              {
                name: "Legacy agility",
                transfer: true,
                changes: [{ key: "system.traits.agi", mode: 2, value: "1" }],
                duration: { rounds: 2, startRound: 1, startTurn: 0 }
              }
            ]
          },
          { pack: pack.collection }
        );
        const source = item.effects.contents[0].toObject();
        if (
          source.system.changes[0].type !== "add" ||
          source.duration.value !== 2 ||
          source.duration.units !== "rounds"
        )
          throw Error("Core legacy effect conversion failed");
        const { DragDropHandler } = await import(
          "/systems/" + id + "/module/sheets/handlers/drag-drop-handler.js"
        );
        const before = pc.system.traits.agi;
        const [embedded] = await DragDropHandler.handleItemDrop({ actor: pc }, null, {
          uuid: item.uuid
        });
        if (
          !embedded ||
          embedded.effects.contents[0].system.changes[0].type !== "add" ||
          pc.system.traits.agi !== before + 1
        )
          throw Error("Drop effect lost");
        const imported = await game.items.importFromCompendium(pack, item.id);
        if (imported.effects.size !== 1) throw Error("Import effects missing");
        acceptance.importedId = imported.id;
        await pack.configure({ locked: true });
        const { runMigrations } = await import("/systems/" + id + "/module/setup/migrations.js");
        await runMigrations("3.2.0", game.system.version);
        if (!pack.locked) throw Error("Locked compendium modified");
        acceptance.droppedItemId = embedded.id;
      })
    );
    await run("Unlinked token embedded items migrate independently", () =>
      gm.evaluate(async () => {
        const pc = acceptance.pc;
        const scene = await Scene.create({ name: "Acceptance tokens", width: 1000, height: 1000 });
        acceptance.sceneId = scene.id;
        const tokenData = await pc.getTokenDocument({ actorLink: false, x: 100, y: 100 });
        const [token] = await scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
        const [skill] = await token.actor.createEmbeddedDocuments("Item", [
          { name: "Synthetic legacy", type: "skill", system: { emphasis: "Token emphasis" } }
        ]);
        await token.actor.unsetFlag("l5r4-enhanced", "migratedVersion");
        const { runMigrations } = await import("/systems/l5r4-enhanced/module/setup/migrations.js");
        await runMigrations("3.2.0", game.system.version);
        if (!token.actor.items.get(skill.id).system.trainedEmphases.includes("Token emphasis"))
          throw Error("Synthetic item not migrated");
        if (pc.items.some(i => i.name === "Synthetic legacy"))
          throw Error("Synthetic item leaked to base actor");
      })
    );
    player = await login("Acceptance Player");
    await run("Actor and item names save through sheet forms", async () => {
      await gm.evaluate(id => game.actors.get(id).sheet.render(true), pcId);
      const field = gm.locator('.l5r4 input[name="name"]').first();
      await field.fill("Saved through form");
      await field.press("Tab");
      await gm.waitForFunction(id => game.actors.get(id).name === "Saved through form", pcId);
      await gm.evaluate(id => game.actors.get(id).sheet.close(), pcId);
      const itemId = await gm.evaluate(async () => {
        const i = await Item.create({ name: "Form item", type: "commonItem" });
        await i.sheet.render(true);
        return i.id;
      });
      const itemField = gm.locator('.l5r4 input[name="name"]').first();
      await itemField.fill("Saved item form");
      await itemField.press("Tab");
      await gm.waitForFunction(id => game.items.get(id).name === "Saved item form", itemId);
      await gm.evaluate(async id => {
        const i = game.items.get(id);
        await i.sheet.close();
        await i.delete();
      }, itemId);
    });

    for (const mode of ["public", "gm", "blind", "self"]) {
      await run("Actual player visibility: " + mode, async () => {
        const result = await gm.evaluate(
          async ({ pcId, mode }) => {
            await game.settings.set("core", "messageMode", mode);
            const { TraitRoll } = await import(
              "/systems/l5r4-enhanced/module/services/dice/rolls/trait-roll.js"
            );
            const m = await TraitRoll({
              actor: game.actors.get(pcId),
              traitRank: 2,
              traitName: "agi",
              askForOptions: false
            });
            return { id: m.id, total: m.rolls[0].total };
          },
          { pcId, mode }
        );
        ids[mode] = result.id;
        await player.waitForFunction(id => !!game.messages.get(id), result.id);
        assert.equal(
          await player.evaluate(id => game.messages.get(id).isContentVisible, result.id),
          mode === "public"
        );
        if (mode === "public") {
          await player
            .locator('[data-message-id="' + result.id + '"] .dice-total')
            .first()
            .waitFor({ state: "attached" });
          assert(
            (
              await player
                .locator('[data-message-id="' + result.id + '"]')
                .first()
                .innerText()
            ).includes(String(result.total))
          );
        } else {
          const card = player.locator('[data-message-id="' + result.id + '"]');
          for (const total of await card.locator(".dice-total").allTextContents())
            assert(!/^-?\d/.test(total.trim()), "Private numerical total leaked");
          assert.equal(
            await card
              .locator(".l5r4-tn-result, .l5r4-gm-difficulty-result, .l5r4-damage-button")
              .count(),
            0
          );
        }
      });
    }
    await run("Player selfroll is private to its author", async () => {
      const id = await player.evaluate(async () => {
        const r = await new Roll("1d10").evaluate();
        return (await r.toMessage({}, { messageMode: "self" })).id;
      });
      await gm.waitForFunction(id => !!game.messages.get(id), id);
      assert.equal(await gm.evaluate(id => game.messages.get(id).isContentVisible, id), false);
      assert.equal(await player.evaluate(id => game.messages.get(id).isContentVisible, id), true);
    });

    await run("Player blind roll hides the result from its author", async () => {
      const id = await player.evaluate(async id => {
        await game.settings.set("core", "messageMode", "blind");
        const { TraitRoll } = await import(
          "/systems/l5r4-enhanced/module/services/dice/rolls/trait-roll.js"
        );
        return (
          await TraitRoll({
            actor: game.actors.get(id),
            traitRank: 2,
            traitName: "agi",
            askForOptions: false
          })
        ).id;
      }, pcId);
      await gm.waitForFunction(id => !!game.messages.get(id), id);
      assert.equal(await player.evaluate(id => game.messages.get(id).isContentVisible, id), false);
      assert.equal(await gm.evaluate(id => game.messages.get(id).isContentVisible, id), true);
    });
    await run("Hidden combatant initiative remains private", async () => {
      const id = await gm.evaluate(async id => {
        await game.settings.set("core", "messageMode", "public");
        const c = await Combat.create({
          combatants: [{ actorId: id, name: "Hidden NPC", hidden: true }]
        });
        try {
          await c.rollInitiative(c.combatants.map(x => x.id));
          const m = game.messages.contents.at(-1);
          if (!m.whisper.includes(game.user.id)) throw Error("Hidden initiative public");
          return m.id;
        } finally {
          await c.delete();
        }
      }, pcId);
      await player.waitForFunction(id => !!game.messages.get(id), id);
      assert.equal(await player.evaluate(id => game.messages.get(id).isContentVisible, id), false);
    });
    await run("Animation integrations safely disable when modules are absent", () =>
      gm.evaluate(async id => {
        const { isSequencerAvailable, isJB2AAvailable } = await import(
          "/systems/l5r4-enhanced/module/services/animations/asset-library.js"
        );
        if (isSequencerAvailable() || isJB2AAvailable())
          throw Error("Unexpected module in isolated test");
        const { playAnimation } = await import(
          "/systems/l5r4-enhanced/module/services/animations/animation-manager.js"
        );
        await playAnimation(game.actors.get(id), "fullAttackStance", true);
      }, pcId)
    );
    await run("Reload preserves migrations, imports, effects and privacy", async () => {
      await gm.reload();
      await gm.waitForFunction(() => globalThis.game?.ready);
      await player.reload();
      await player.waitForFunction(() => globalThis.game?.ready);
      await gm.evaluate(id => {
        const pc = game.actors.get(id);
        const skill = pc.items.find(i => i.name === "Legacy skill");
        if (!skill?.system.trainedEmphases.includes("Acceptance emphasis"))
          throw Error("Skill persistence failed");
        if (!pc.items.some(i => i.effects.size)) throw Error("Dropped effects missing");
        if (game.settings.get("l5r4-enhanced", "lastMigratedVersion") !== game.system.version)
          throw Error("Checkpoint persistence failed");
      }, pcId);
      for (const [mode, id] of Object.entries(ids))
        assert.equal(
          await player.evaluate(id => game.messages.get(id).isContentVisible, id),
          mode === "public"
        );
    });
    assert.deepEqual(errors, []);
    await gm.screenshot({ path: output + "/final.png" });
  } finally {
    fs.writeFileSync(output + "/results.json", JSON.stringify({ results, errors }, null, 2));
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
