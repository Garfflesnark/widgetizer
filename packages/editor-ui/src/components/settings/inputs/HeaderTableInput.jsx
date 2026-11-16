import TableInput from "./TableInput";
import useLinkTargets from "../../../hooks/useLinkTargets";
import { useEditingLanguage } from "../../../lib/editingLanguage";

/** Header navigation rows need the active project's page targets; other tables stay self-contained. */
export default function HeaderTableInput(props) {
  const { options, loading } = useLinkTargets();
  const language = useEditingLanguage();
  const pageOptions = options
    .filter((option) => option.isPage && option.language === language)
    .map((option) => ({ value: option.value, label: option.label, slug: option.slug }));
  return <TableInput {...props} pageOptions={loading ? [] : pageOptions} />;
}
