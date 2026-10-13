import { SYS_ID } from "../config/constants.js";

export const GM_DIFFICULTY_SETTING = "gmDifficulty";

export function normalizeGMDifficulty(value = {}) {
  const number = Number(value?.tn);
  return {
    enabled: value?.enabled === true,
    tn: Number.isFinite(number) ? Math.max(1, Math.floor(number)) : 15
  };
}

export function getGMDifficulty() {
  try {
    return normalizeGMDifficulty(game.settings.get(SYS_ID, GM_DIFFICULTY_SETTING));
  } catch {
    return { enabled: false, tn: 15 };
  }
}

export function resolveGMDifficulty(originalTN, config = getGMDifficulty()) {
  return config.enabled ? config.tn : originalTN;
}

/** Store the difficulty used by this roll, even if the MJ changes it before publication. */
export function difficultyFlags(config, effective, flags = {}) {
  return {
    ...flags,
    [SYS_ID]: {
      ...flags[SYS_ID],
      gmDifficulty: { ...config, effective }
    }
  };
}

export async function saveGMDifficulty(config) {
  if (!game.user?.isGM) {
    return false;
  }
  await game.settings.set(SYS_ID, GM_DIFFICULTY_SETTING, normalizeGMDifficulty(config));
  return true;
}

export function refreshRollDifficulty(dialog) {
  const root = dialog.element;
  if (!root?.classList.contains("l5r4-roll-dialog")) {
    return;
  }
  const config = getGMDifficulty();
  const input = root.querySelector('input[name="tn"]');
  let notice = root.querySelector(".l5r4-gm-difficulty-notice");
  if (config.enabled) {
    if (!notice) {
      notice = document.createElement("p");
      notice.className = "l5r4-gm-difficulty-notice";
      notice.setAttribute("role", "status");
      root.querySelector(".window-content")?.prepend(notice);
    }
    notice.textContent = `ND de base fixé par le MJ : ${config.tn}. Les augmentations et modificateurs s'ajoutent normalement.`;
    if (input) {
      if (input.dataset.gmOriginalTn === undefined) {
        input.dataset.gmOriginalTn = input.value;
      }
      input.value = String(config.tn);
      input.readOnly = true;
      input.setAttribute("aria-label", "ND de base fixé par le MJ");
    }
  } else {
    notice?.remove();
    if (input?.dataset.gmOriginalTn !== undefined) {
      input.value = input.dataset.gmOriginalTn;
      input.readOnly = false;
      input.removeAttribute("aria-label");
      delete input.dataset.gmOriginalTn;
    }
  }
}

function refresh() {
  const config = getGMDifficulty();
  for (const button of document.querySelectorAll(".l5r4-gm-difficulty")) {
    const label = config.enabled ? `Difficulté MJ : ND ${config.tn}` : "Difficulté MJ (désactivée)";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("data-tooltip", label);
    button.setAttribute("aria-pressed", String(config.enabled));
    button.classList.toggle("active", config.enabled);
    button.textContent = config.enabled ? String(config.tn) : "ND";
  }
  for (const dialog of foundry.applications.instances.values()) {
    refreshRollDifficulty(dialog);
  }
}

export async function showGMDifficulty() {
  if (!game.user?.isGM) {
    return;
  }
  const config = getGMDifficulty();
  return foundry.applications.api.DialogV2.wait({
    classes: ["themed", "theme-light", "l5r4-gm-difficulty-dialog"],
    window: { title: "Difficulté MJ" },
    position: { width: 420 },
    content: `<div class="form-group"><label for="l5r4-gm-tn">ND de base</label><div class="form-fields"><input id="l5r4-gm-tn" type="number" name="tn" min="1" step="1" required value="${
      config.tn
    }"></div></div>
      <div class="form-group"><label for="l5r4-gm-enabled">Imposer ce ND à tous les jets</label><div class="form-fields"><input id="l5r4-gm-enabled" name="enabled" type="checkbox" ${
        config.enabled ? "checked" : ""
      }></div></div>
      <p>Ce ND remplace la saisie du joueur et les ND automatiques. Les augmentations et modificateurs continuent de s'appliquer.</p>
      <p>Les jets de dégâts, d'initiative et les jets directs affichent aussi une comparaison au ND, sans modifier les dégâts ni l'ordre d'initiative.</p>`,
    buttons: [
      {
        action: "save",
        label: "Enregistrer",
        default: true,
        callback: async (_event, button) => {
          const form = button.form;
          return saveGMDifficulty({
            enabled: form.elements.enabled.checked,
            tn: form.elements.tn.value
          });
        }
      },
      { action: "cancel", label: "Annuler" }
    ]
  });
}

export function renderGMDifficultyButton(_app, html) {
  if (!game.user?.isGM) {
    return;
  }
  const root = html instanceof HTMLElement ? html : html?.["#chat-controls"] ?? html?.[0];
  const anchor = root?.querySelector("#message-modes, #roll-privacy");
  if (!anchor || anchor.parentElement.querySelector(".l5r4-gm-difficulty")) {
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "l5r4-gm-difficulty ui-control";
  button.addEventListener("click", showGMDifficulty);
  anchor.after(button);
  refresh();
}

/** Cover native /roll, macros, damage and initiative without changing their totals or visibility. */
export function annotateGMDifficulty(message) {
  if (!message.rolls?.length) {
    return;
  }
  const stored = message.flags?.[SYS_ID]?.gmDifficulty;
  const config = stored ?? getGMDifficulty();
  if (!config.enabled) {
    return;
  }
  const tn = normalizeGMDifficulty(config).tn;
  const content = message.content ?? "";
  if (content.includes('data-l5r4-gm-difficulty="true"')) {
    return;
  }
  const hasResult = content.includes("l5r4-tn-result");
  const effective = Number.isFinite(stored?.effective) ? stored.effective : tn;
  const comparisons = hasResult
    ? ""
    : message.rolls
        .map((roll, index) => {
          const total = Number(roll.total);
          if (!Number.isFinite(total)) {
            return "";
          }
          const outcome = total >= effective ? "Réussite" : "Échec";
          return `<div>Jet ${index + 1} : ${outcome} — ${total} / ND ${effective}</div>`;
        })
        .join("");
  message.updateSource({
    content: `${content}<div class="l5r4-gm-difficulty-result" data-l5r4-gm-difficulty="true"><small>ND de base MJ : ${tn}</small>${comparisons}</div>`,
    [`flags.${SYS_ID}.gmDifficulty`]: { ...config, effective }
  });
}

export function registerGMDifficulty() {
  game.settings.register(SYS_ID, GM_DIFFICULTY_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: { enabled: false, tn: 15 },
    onChange: refresh
  });
  Hooks.on("renderChatLog", renderGMDifficultyButton);
  Hooks.on("renderChatInput", renderGMDifficultyButton);
  Hooks.on("renderDialogV2", refreshRollDifficulty);
  Hooks.on("preCreateChatMessage", annotateGMDifficulty);
}
