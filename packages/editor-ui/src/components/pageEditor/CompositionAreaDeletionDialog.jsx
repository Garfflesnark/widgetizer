import { useEffect } from "react";
import ConfirmationModal from "../ui/ConfirmationModal";
import usePageStore from "../../stores/pageStore";
import useWidgetStore from "../../stores/widgetStore";
import useToastStore from "../../stores/toastStore";
import { deleteCompositionArea } from "../../lib/compositionActions";

export default function CompositionAreaDeletionDialog({ request, onClose }) {
  const page = usePageStore(state => state.page);
  const loadedProjectId = usePageStore(state => state.loadedProjectId);
  const activeLoadId = usePageStore(state => state.activeLoadId);
  const context = useWidgetStore(state => state.compositionContext);
  const area = page?.wyrmetizerEditorLayout?.areas[request.areaId];
  const valid = page === request.page && loadedProjectId === request.loadedProjectId &&
    activeLoadId === request.activeLoadId && !!area && context === "desktop";
  useEffect(() => { if (!valid) onClose(); }, [valid, onClose]);
  const confirm = deleteContents => {
    // A dialog must never delete from a changed page or membership snapshot.
    const state = usePageStore.getState();
    if (state.page !== request.page || state.loadedProjectId !== request.loadedProjectId ||
        state.activeLoadId !== request.activeLoadId || useWidgetStore.getState().compositionContext !== "desktop") return;
    try { deleteCompositionArea(request.areaId, { deleteContents }); }
    catch (error) { useToastStore.getState().showToast(error.message, "error"); }
  };
  const populated = !!area?.members.length;
  return <ConfirmationModal isOpen={valid} onClose={onClose} onConfirm={() => confirm(false)}
    title="Delete Composition Area?" cancelText="Cancel" returnFocusTo={request.returnFocusTo}
    variant={populated ? "warning" : "danger"}
    message={populated ? "Preserve Contents returns the children to independent Flow Widgets with their authored Flow settings and order. Delete All Contents removes the area and its child Widgets. Media assets remain in the library." : "Delete this empty Composition Area?"}
    confirmText={populated ? "Preserve Contents" : "Delete Composition Area"}
    additionalAction={populated ? { text: "Delete All Contents", onConfirm: () => confirm(true) } : null} />;
}
