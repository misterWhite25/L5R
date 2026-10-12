/** Read v14 changes, retaining support for plain legacy import data. */
export function effectChanges(effect) {
  return effect?.system?.changes ?? effect?.changes ?? [];
}

export function isAdditiveChange(change) {
  return change?.type !== undefined ? change.type === "add" : change?.mode === 2;
}
