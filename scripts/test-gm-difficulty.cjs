const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  const errors = [];
  const login = async name => {
    const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    p.setDefaultTimeout(30000);
    await p.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
    p.on("pageerror", e => errors.push(e.message));
    await p.goto("http://127.0.0.1:30005");
    assert((await p.locator("body").innerText()).includes("L5R GM difficulty TEST"));
    await p.locator("input[name=username]").fill(name);
    await p.locator("button[name=join]").click();
    if (name === "Test Player") {
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
    const gm = await login("Gamemaster");
    const actorId = await gm.evaluate(async () => {
      if (game.world.id !== "l5r-gm-difficulty-test") throw Error("Wrong world");
      const u =
        game.users.find(u => u.name === "Test Player") ??
        (await User.create({ name: "Test Player", role: 1 }));
      const f = await import("/systems/l5r4-enhanced/tests/fixtures/actor-fixtures.js");
      const a = await f.createTestPC({
        name: "Difficulty test",
        ownership: { [u.id]: 3 },
        system: { rings: { void: { rank: 4, value: 4 } } }
      });
      return a.id;
    });
    const player = await login("Test Player");
    await gm.locator(".l5r4-gm-difficulty").click();
    await gm.locator(".l5r4-gm-difficulty-dialog input[name=tn]").fill("25");
    await gm.locator(".l5r4-gm-difficulty-dialog input[name=enabled]").check();
    require("node:fs").mkdirSync("test-results/gm-difficulty", { recursive: true });
    await gm.screenshot({ path: "test-results/gm-difficulty/settings.png" });
    await gm.locator(".l5r4-gm-difficulty-dialog button[data-action=save]").click();
    await player.waitForFunction(
      () => game.settings.get("l5r4-enhanced", "gmDifficulty").tn === 25
    );
    assert.equal(await player.locator(".l5r4-gm-difficulty").count(), 0);
    assert.equal(
      await player.evaluate(async () => {
        const m = await import("/systems/l5r4-enhanced/module/services/gm-difficulty.js");
        return m.saveGMDifficulty({ enabled: true, tn: 1 });
      }),
      false
    );
    await player.evaluate(id => {
      import("/systems/l5r4-enhanced/module/services/dice/rolls/trait-roll.js").then(m => {
        globalThis.pendingRoll = m.TraitRoll({
          traitRank: 3,
          traitName: "agi",
          actor: game.actors.get(id)
        });
      });
    }, actorId);
    const input = player.locator(".l5r4-roll-dialog input[name=tn]");
    await input.waitFor();
    assert.equal(await input.inputValue(), "25");
    assert(await input.evaluate(el => el.readOnly));
    await player.screenshot({ path: "test-results/gm-difficulty/player.png" });
    await gm.evaluate(() =>
      game.settings.set("l5r4-enhanced", "gmDifficulty", { enabled: true, tn: 30 })
    );
    await player.waitForFunction(
      () => document.querySelector(".l5r4-roll-dialog input[name=tn]")?.value === "30"
    );
    await player.locator(".l5r4-roll-dialog input[name=raises]").fill("2");
    await player.locator(".l5r4-roll-dialog button[data-action=ok]").click();
    const flags = await player.evaluate(async () => {
      const msg = await pendingRoll;
      return msg.flags["l5r4-enhanced"].gmDifficulty;
    });
    assert.equal(flags.tn, 30);
    assert.equal(flags.effective, 40);
    const direct = await player.evaluate(async () => {
      const r = await new Roll("1d10").evaluate();
      const m = await r.toMessage({}, { rollMode: "selfroll" });
      return {
        total: r.total,
        flags: m.flags["l5r4-enhanced"].gmDifficulty,
        content: m.content,
        whisper: m.whisper
      };
    });
    assert.equal(direct.flags.effective, 30);
    assert(direct.content.includes("Échec"));
    assert(direct.whisper.length);

    const kinds = await gm.evaluate(async id => {
      const base = "/systems/l5r4-enhanced/";
      const actor = game.actors.get(id);
      const out = [];
      for (const [file, name, options] of [
        ["trait-roll", "TraitRoll", { traitRank: 3, traitName: "agi", askForOptions: false }],
        [
          "skill-roll",
          "SkillRoll",
          {
            actorTrait: 3,
            skillRank: 3,
            skillName: "Kenjutsu",
            skillTrait: "agi",
            askForOptions: false
          }
        ],
        [
          "ring-roll",
          "RingRoll",
          { ringRank: 2, ringName: "Fire", systemRing: "fire", askForOptions: false }
        ],
        [
          "weapon-roll",
          "WeaponRoll",
          { diceRoll: 5, diceKeep: 2, weaponName: "Katana", askForOptions: false }
        ]
      ]) {
        const m = await import(base + "module/services/dice/rolls/" + file + ".js");
        const msg = await m[name]({ actor, ...options });
        if (msg?.flags["l5r4-enhanced"]?.gmDifficulty?.effective !== 30)
          throw Error(file + " ND missing");
        out.push(file);
      }
      await actor.update({ "system.spellSlots.fire": 3 });
      const f = await import(base + "tests/fixtures/item-fixtures.js");
      const [spell] = await actor.createEmbeddedDocuments("Item", [
        f.createSpellData("Test fire", "fire", 1)
      ]);
      const { SpellCastRoll } = await import(
        base + "module/services/dice/rolls/spell-cast-roll.js"
      );
      const msg = await SpellCastRoll({ actor, spell, showDialog: false });
      if (msg?.flags["l5r4-enhanced"]?.gmDifficulty?.effective !== 30)
        throw Error("Spell ND missing");
      out.push("spell");
      await spell.update({ "system.maho": true });
      const { MahoCastRoll } = await import(base + "module/services/dice/rolls/maho-cast-roll.js");
      const maho = await MahoCastRoll({ actor, spell, showDialog: false });
      if (maho?.flags["l5r4-enhanced"]?.gmDifficulty?.effective !== 30)
        throw Error("Maho ND missing");
      out.push("maho");
      const fixtures = await import(base + "tests/fixtures/actor-fixtures.js");
      const npc = await fixtures.createTestNPC({
        name: "Fear test",
        system: { fear: { rank: 1 } }
      });
      const { testFear } = await import(base + "module/services/fear.js");
      const fear = await testFear({ npc, character: actor });
      if (fear?.flags["l5r4-enhanced"]?.gmDifficulty?.effective !== 30)
        throw Error("Fear ND missing");
      out.push("fear");
      const { TraitRoll } = await import(base + "module/services/dice/rolls/trait-roll.js");
      const original = actor.system._conditionEffects;
      actor.system._conditionEffects = { ...original, tnPenalty: 5 };
      try {
        const result = await TraitRoll({
          actor,
          traitRank: 3,
          traitName: "agi",
          askForOptions: false
        });
        if (result.flags["l5r4-enhanced"].gmDifficulty.effective !== 35)
          throw Error("Condition TN lost");
        out.push("condition +5");
      } finally {
        actor.system._conditionEffects = original;
      }
      const combat = await Combat.create({ combatants: [{ actorId: actor.id, name: actor.name }] });
      try {
        await combat.rollInitiative(combat.combatants.map(c => c.id));
        const m = game.messages.contents.at(-1);
        if (m.flags["l5r4-enhanced"]?.gmDifficulty?.effective !== 30)
          throw Error("Initiative ND missing");
        out.push("initiative");
      } finally {
        await combat.delete();
      }
      return out;
    }, actorId);
    console.log("PASS:", kinds.join(", "));
    await gm.evaluate(id => {
      import("/systems/l5r4-enhanced/module/services/dice/rolls/simple-roll.js").then(m => {
        globalThis.pendingNpc = m.SimpleRoll({
          actor: game.actors.find(a => a.type === "npc"),
          rollName: "Test NPC",
          diceRoll: 3,
          diceKeep: 2
        });
      });
    }, actorId);
    await gm.locator(".l5r4-roll-dialog input[name=raises]").fill("1");
    await gm.locator(".l5r4-roll-dialog button[data-action=ok]").click();
    assert.equal(
      await gm.evaluate(
        async () => (await pendingNpc).flags["l5r4-enhanced"].gmDifficulty.effective
      ),
      35
    );
    console.log("PASS: NPC with raise 30+5=35");
    await gm.evaluate(() =>
      game.settings.set("l5r4-enhanced", "gmDifficulty", { enabled: false, tn: 30 })
    );
    await player.waitForFunction(() => !game.settings.get("l5r4-enhanced", "gmDifficulty").enabled);
    const disabled = await player.evaluate(async () => {
      const m = await new Roll("1d10").toMessage();
      return m.content;
    });
    assert(!disabled.includes("data-l5r4-gm-difficulty"));
    assert.deepEqual(errors, []);
    console.log(
      "PASS: GM UI, player permissions, two-client synchronization, open-dialog update, raises 30+10=40, direct private roll, disabling; no browser errors."
    );
  } catch (e) {
    console.error("Browser errors:", errors);
    for (const c of browser.contexts())
      for (const p of c.pages())
        console.error(
          "Page:",
          p.url(),
          await p
            .locator("#chat")
            .evaluate(el => el.outerHTML)
            .catch(() => p.locator("body").innerText())
        );
    throw e;
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
