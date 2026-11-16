import { useState, useRef, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Grip, GripVertical, Plus, Trash2 } from "lucide-react";
import Button, { IconButton } from "../../ui/Button";
import TextInput from "./TextInput";
import SelectInput from "./SelectInput";

let uidCounter = 0;
const nextUid = () => `table-row-${(uidCounter += 1)}`;
const cellOf = (row, colId) => {
  const value = row?.[colId];
  return typeof value === "string" ? value : typeof value === "boolean" ? String(value) : "";
};
const rowHasContent = (values, columns) => columns.some((c) => String(values[c.id] ?? "").trim() !== "");

function toRows(value, columns, rowNames) {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === "object" && !Array.isArray(row)).map((row) => ({
    uid: nextUid(), rowName: rowNames && typeof row.row_name === "string" ? row.row_name : "",
    values: Object.fromEntries(columns.map((c) => [c.id,
      cellOf(row, c.id) || c.default || (c.type === "select" ? c.options?.[0]?.value || "" : ""),
    ])),
  }));
}

function toValue(rows, columns, rowNames) {
  return rows.filter((row) => rowHasContent(row.values, columns)).map((row) => ({
    ...Object.fromEntries(columns.map((column) => [column.id, row.values[column.id] ?? ""])),
    ...(rowNames ? { row_name: row.rowName?.trim() || "" } : {}),
  }));
}

const signature = (entries) => JSON.stringify(Array.isArray(entries) ? entries : []);

function TableRow({ row, rowIndex, columns, onCellChange, onRowNameChange, onRowNameBlur, onRemove, rowNames, pageOptions }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.uid });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition, opacity: isDragging ? 0.4 : 1, position: "relative", zIndex: isDragging ? 50 : 1,
  };
  const visibleColumns = columns.filter((column) => column.type !== "hidden");
  const destinationTypeColumn = columns.find((column) => column.type === "destination")?.destinationTypeColumn;
  const destinationColumn = columns.find((column) => column.type === "destination");
  const storedPageUuid = destinationColumn ? row.values[destinationColumn.pageUuidColumn] : "";
  const storedDestination = destinationColumn ? row.values[destinationColumn.id] : "";
  const storedPage = pageOptions.find((option) => option.value === storedPageUuid);
  const legacyPage = !storedPageUuid && pageOptions.find((option) => option.slug === storedDestination);
  const unavailableValue = storedPageUuid ? `missing:${storedPageUuid}` : `missing:${storedDestination}`;
  const pageValue = storedPage?.value || legacyPage?.value || (storedPageUuid || storedDestination ? unavailableValue : "");
  const unavailableOption = !storedPage && !legacyPage && (storedPageUuid || storedDestination)
    ? [{ value: unavailableValue, label: `Unavailable page (${storedDestination || storedPageUuid})` }]
    : [];
  const cellLayout = rowNames
    ? "grid grid-cols-1 sm:grid-cols-2"
    : visibleColumns.length === 2 ? "flex-1 min-w-0 grid grid-cols-2" : "flex-1 min-w-0 flex flex-col";

  return (
    <div ref={setNodeRef} style={style} className={`flex ${rowNames ? "flex-col" : "items-stretch"} gap-3 p-3 bg-slate-50 border border-slate-200 rounded-md`}>
      {rowNames ? (
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button type="button" {...attributes} {...listeners} className="cursor-grab p-1 shrink-0 flex items-center text-slate-400 hover:text-slate-600" aria-label={`Reorder ${row.rowName || `Row ${rowIndex + 1}`}`}>
            <Grip size={18} />
          </button>
          <TextInput value={row.rowName} placeholder={`Row ${rowIndex + 1}`} ariaLabel={`Row ${rowIndex + 1} name`} onChange={onRowNameChange} onBlur={onRowNameBlur} />
          <IconButton type="button" variant="danger" size="sm" onClick={onRemove} title="Remove row"><Trash2 size={18} /></IconButton>
        </div>
      ) : (
        <div {...attributes} {...listeners} className="cursor-grab p-1 shrink-0 flex items-center text-slate-400 hover:text-slate-600" aria-label="Reorder row"><GripVertical size={18} /></div>
      )}

      <div className={`${cellLayout} gap-3 min-w-0`}>
        {visibleColumns.map((column) => (
          <label key={column.id} className={`flex flex-col gap-1 min-w-0 ${rowNames && column.layout === "full" ? "sm:col-span-2" : ""}`}>
            <span className="text-xs font-medium text-slate-500">{column.label || column.id}</span>
            {column.type === "destination" ? (
              row.values[destinationTypeColumn] === "page" ? (
                <SelectInput id={`${row.uid}-${column.id}`} value={pageValue}
                  options={[{ value: "", label: "Select a page" }, ...pageOptions, ...unavailableOption]}
                  onChange={(uuid) => onCellChange(column.id, uuid, pageOptions.find((option) => option.value === uuid)?.slug || "")} />
              ) : (
                <TextInput value={row.values[column.urlColumn] || (!row.values[column.pageUuidColumn] ? row.values[column.id] : "")} onChange={(url) => onCellChange(column.id, "", url)} />
              )
            ) : column.type === "select" ? (
              <SelectInput id={`${row.uid}-${column.id}`} value={row.values[column.id] ?? column.options?.[0]?.value ?? ""} options={column.options || []} onChange={(v) => onCellChange(column.id, v)} />
            ) : column.type === "checkbox" ? (
              <input type="checkbox" id={`${row.uid}-${column.id}`} checked={row.values[column.id] === "true"} onChange={(event) => onCellChange(column.id, event.target.checked ? "true" : "false")} />
            ) : (
              <TextInput value={row.values[column.id] ?? ""} onChange={(v) => onCellChange(column.id, v)} />
            )}
          </label>
        ))}
      </div>

      {!rowNames && <div className="self-stretch w-px bg-slate-200 shrink-0" />}
      {!rowNames && <div className="flex items-center shrink-0"><IconButton type="button" variant="danger" size="sm" onClick={onRemove} title="Remove row"><Trash2 size={18} /></IconButton></div>}
    </div>
  );
}

export default function TableInput({ value, onChange, columns = [], rowNames = false, pageOptions = [] }) {
  const cols = Array.isArray(columns) ? columns : [];
  const [rows, setRows] = useState(() => toRows(value, cols, rowNames));
  const mounted = useRef(false);
  const echoExpected = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (echoExpected.current) { echoExpected.current = false; return; }
    setRows(toRows(value, cols, rowNames));
    // The schema is stable while this input is mounted; value changes include undo/redo and item switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const apply = (nextRows) => {
    const nextValue = toValue(nextRows, cols, rowNames);
    if (signature(nextValue) === signature(toValue(rows, cols, rowNames))) { setRows(nextRows); return; }
    setRows(nextRows);
    echoExpected.current = true;
    onChange(nextValue);
  };
  const emptyValues = () => Object.fromEntries(cols.map((column) => [column.id, column.default || (column.type === "select" ? column.options?.[0]?.value || "" : "")]));
  const handleAdd = () => setRows((previous) => [...previous, { uid: nextUid(), rowName: "", values: emptyValues() }]);
  const setCell = (uid, colId, value) => apply(rows.map((row) => row.uid === uid ? { ...row, values: { ...row.values, [colId]: value } } : row));
  const setDestination = (uid, colId, uuid, destinationValue) => apply(rows.map((row) => {
    if (row.uid !== uid) return row;
    const column = cols.find((item) => item.id === colId);
    const values = { ...row.values, [colId]: destinationValue, [column.pageUuidColumn]: uuid };
    if (row.values[column.destinationTypeColumn] === "url") values[column.urlColumn] = destinationValue;
    return { ...row, values };
  }));
  const setDestinationType = (uid, colId, value) => apply(rows.map((row) => {
    if (row.uid !== uid) return row;
    const column = cols.find((item) => item.type === "destination");
    const values = { ...row.values, [colId]: value };
    if (value === "url" && row.values[column.urlColumn]) values[column.id] = row.values[column.urlColumn];
    if (value === "page" && row.values[column.pageUuidColumn]) values[column.id] = pageOptions.find((option) => option.value === row.values[column.pageUuidColumn])?.slug || "";
    return { ...row, values };
  }));
  const removeRow = (uid) => apply(rows.filter((row) => row.uid !== uid));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((row) => row.uid === active.id);
    const newIndex = rows.findIndex((row) => row.uid === over.id);
    if (oldIndex !== -1 && newIndex !== -1) apply(arrayMove(rows, oldIndex, newIndex));
  };

  if (cols.length === 0) return <p className="text-sm text-slate-500">This table has no columns defined.</p>;
  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rows.map((row) => row.uid)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">{rows.map((row, rowIndex) => <TableRow key={row.uid} row={row} rowIndex={rowIndex} columns={cols} pageOptions={pageOptions} rowNames={rowNames}
            onCellChange={(colId, value, second) => {
              const column = cols.find((item) => item.id === colId);
              if (column?.type === "destination") setDestination(row.uid, colId, value, second);
              else if (column?.type === "select" && cols.some((item) => item.type === "destination" && item.destinationTypeColumn === colId)) setDestinationType(row.uid, colId, value);
              else setCell(row.uid, colId, value);
            }}
            onRowNameChange={(name) => apply(rows.map((item) => item.uid === row.uid ? { ...item, rowName: name } : item))}
            onRowNameBlur={() => {
              if (!row.rowName.trim()) apply(rows.map((item, index) => item.uid === row.uid ? { ...item, rowName: `Row ${index + 1}` } : item));
            }}
            onRemove={() => removeRow(row.uid)} />)}</div>
        </SortableContext>
      </DndContext>}
      <Button type="button" variant="secondary" size="sm" onClick={handleAdd} className="self-start"><Plus size={16} className="mr-1" />Add row</Button>
    </div>
  );
}
