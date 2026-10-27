import usePageStore from "../stores/pageStore";
import useAutoSave from "../stores/saveStore";

export function editorHistoryState() {
  const { pastStates, futureStates } = usePageStore.temporal.getState();
  return { canUndo: !!pastStates.at(-1)?.page, canRedo: futureStates.length > 0 };
}
export function performEditorHistory(command) {
  const state = editorHistoryState();
  if ((command === "undo" && !state.canUndo) || (command === "redo" && !state.canRedo) ||
      !["undo", "redo"].includes(command)) return false;
  usePageStore.temporal.getState()[command]();
  usePageStore.getState().syncThemeStoreFromSnapshot();
  useAutoSave.getState().reconcileModifiedWidgets();
  return true;
}
