import React, { useMemo, useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search as SearchIcon, AlertCircle } from 'lucide-react';
import { useDensity, type Density } from '../../context/DensityContext';
import { EmptyState } from './EmptyState';

// DataTable — tabla genérica, tipada, con sort + sticky header + density-aware.
//
// Diseño:
//   - Columnas declarativas tipadas con generic <T>.
//   - Sort cliente-side por columna (sortFn opcional para custom).
//   - Sticky header con sombra sutil al hacer scroll.
//   - Estados loading / error / empty integrados.
//   - Hereda densidad del DensityContext (compact reduce padding y altura
//     de fila ~30%).
//   - Búsqueda global opcional (concatena accessors stringificados).
//   - Toolbar slot para filtros custom y botones de acción.
//   - Click-row opcional con focus ring + cursor pointer.
//
// Lo que NO hace (a propósito, para no inflar):
//   - Sort/filter server-side (controlado externamente por el padre)
//   - Paginación (typically 50-200 filas se ven bien sin paginar; si crece
//     más, virtualizar con react-virtuoso es la salida limpia)
//   - Selección múltiple con checkbox — si se necesita, se agrega luego
//   - Column resizing — premature; pocos casos lo piden

export type SortDirection = 'asc' | 'desc';

export interface Column<T> {
  /** Identificador estable. Usado para sort/visibility state. */
  id: string;
  /** Header visible. */
  header: React.ReactNode;
  /** Acceso al valor de la fila. Usado para sort default y búsqueda. */
  accessor: (row: T) => unknown;
  /** Render personalizado de la celda. Si se omite, usa accessor stringificado. */
  cell?: (row: T) => React.ReactNode;
  /** Activa sort en la columna. Default: true si es sortable. */
  sortable?: boolean;
  /** Comparator custom. Si no hay, usa comparación default (string/number/Date). */
  sortFn?: (a: T, b: T) => number;
  /** Alineación del contenido. */
  align?: 'left' | 'right' | 'center';
  /** Ancho CSS (e.g. '180px', '20%', 'minmax(120px, 1fr)'). */
  width?: string;
  /** Esconde la columna inicialmente (útil para columnas opcionales). */
  hidden?: boolean;
  /** Clase adicional para <th> y <td> de esta columna. */
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  /** Identificador único por fila — usado en keys de React. */
  rowKey: (row: T) => string;
  /** Si se pasa, las filas son clickeables con focus ring. */
  onRowClick?: (row: T) => void;
  /** Clase adicional por fila (ej: bg-red-50/30 para riesgos críticos). */
  rowClassName?: (row: T) => string | undefined;
  /** Activa búsqueda global en la toolbar. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Sticky header (default true). */
  stickyHeader?: boolean;
  /** Override de densidad. Default: DensityContext. */
  density?: Density;
  /** Estado loading — muestra skeleton de filas. */
  isLoading?: boolean;
  /** Mensaje de error. Si presente, oculta data y muestra estado de error. */
  error?: string | null;
  /** Estado vacío. Acepta nodo o config rápido. */
  empty?: React.ReactNode | { title: string; description?: string };
  /** Slot a la izquierda del search en la toolbar. */
  toolbar?: React.ReactNode;
  /** Slot a la derecha de la toolbar (acciones, export, etc.). */
  toolbarRight?: React.ReactNode;
  /** Sort inicial. */
  defaultSort?: { id: string; dir: SortDirection };
  /** Aria-label de la tabla (a11y crítico — describe el contenido). */
  'aria-label': string;
  className?: string;
}

// ── Comparador default ──────────────────────────────────────────────────────
function defaultCompare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

// ── Density styles para la tabla ────────────────────────────────────────────
const tableStyles: Record<Density, { th: string; td: string; row: string }> = {
  comfortable: {
    th:  'px-4 py-3',
    td:  'px-4 py-3',
    row: '', // no extra
  },
  compact: {
    th:  'px-3 py-2',
    td:  'px-3 py-1.5',
    row: '',
  },
};

// ── Componente ──────────────────────────────────────────────────────────────
// Nota: usamos function declaration en lugar de FC para que TypeScript infiera
// bien el generic <T> (FC<DataTableProps<T>> rompe el inference).
export function DataTable<T>({
  data,
  columns,
  rowKey,
  onRowClick,
  rowClassName,
  searchable = false,
  searchPlaceholder = 'Buscar...',
  stickyHeader = true,
  density,
  isLoading = false,
  error = null,
  empty,
  toolbar,
  toolbarRight,
  defaultSort,
  'aria-label': ariaLabel,
  className = '',
}: DataTableProps<T>): React.ReactElement {
  const ctxDensity = useDensity();
  const d = density ?? ctxDensity;
  const s = tableStyles[d];

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ id: string; dir: SortDirection } | null>(
    defaultSort ?? null,
  );

  const visibleCols = useMemo(() => columns.filter((c) => !c.hidden), [columns]);

  // Filtrado por búsqueda global (token-AND sobre accessors stringificados).
  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return data;
    const tokens = query.trim().toLowerCase().split(/\s+/);
    return data.filter((row) => {
      const haystack = visibleCols
        .map((c) => {
          const v = c.accessor(row);
          return v == null ? '' : String(v);
        })
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [data, query, searchable, visibleCols]);

  // Ordenado.
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = visibleCols.find((c) => c.id === sort.id);
    if (!col) return filtered;
    const cmp = col.sortFn ?? ((a: T, b: T) => defaultCompare(col.accessor(a), col.accessor(b)));
    const out = [...filtered].sort(cmp);
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [filtered, sort, visibleCols]);

  const handleSort = useCallback(
    (col: Column<T>) => {
      if (!col.sortable) return;
      setSort((prev) => {
        if (prev?.id === col.id) {
          // toggle asc -> desc -> off
          if (prev.dir === 'asc') return { id: col.id, dir: 'desc' };
          return null;
        }
        return { id: col.id, dir: 'asc' };
      });
    },
    [],
  );

  const showToolbar = searchable || !!toolbar || !!toolbarRight;
  const colCount = visibleCols.length;

  return (
    <div className={['flex flex-col gap-3', className].filter(Boolean).join(' ')}>
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {toolbar && <div className="flex items-center gap-2 flex-wrap">{toolbar}</div>}
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <SearchIcon
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-velum-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Filtrar tabla"
                className="w-full h-9 pl-8 pr-3 text-sm rounded-md border border-velum-200 bg-white text-velum-900 placeholder:text-velum-400 focus:outline-none focus-visible:shadow-focus focus:border-velum-400 transition"
              />
            </div>
          )}
          {toolbarRight && (
            <div className="flex items-center gap-2 flex-wrap sm:ml-auto">{toolbarRight}</div>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-lg border border-velum-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label={ariaLabel}>
            <thead
              className={[
                'bg-velum-50 text-velum-700',
                stickyHeader ? 'sticky top-0 z-[1]' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <tr>
                {visibleCols.map((col) => {
                  const isSorted = sort?.id === col.id;
                  const ariaSort: React.AriaAttributes['aria-sort'] = isSorted
                    ? sort.dir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : col.sortable
                      ? 'none'
                      : undefined;
                  return (
                    <th
                      key={col.id}
                      scope="col"
                      aria-sort={ariaSort}
                      style={col.width ? { width: col.width } : undefined}
                      className={[
                        s.th,
                        'text-[11px] font-bold uppercase tracking-widest border-b border-velum-200',
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                            ? 'text-center'
                            : 'text-left',
                        col.className ?? '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(col)}
                          className="inline-flex items-center gap-1.5 hover:text-velum-900 transition-colors duration-fast focus:outline-none focus-visible:shadow-focus rounded"
                        >
                          <span>{col.header}</span>
                          {isSorted ? (
                            sort.dir === 'asc' ? (
                              <ChevronUp size={12} className="text-velum-700" aria-hidden="true" />
                            ) : (
                              <ChevronDown size={12} className="text-velum-700" aria-hidden="true" />
                            )
                          ) : (
                            <ChevronsUpDown size={12} className="text-velum-300" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* Estado: error */}
              {error ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12">
                    <div className="flex flex-col items-center text-center gap-2">
                      <AlertCircle size={20} className="text-danger-500" />
                      <p className="text-sm text-velum-900 font-medium">No se pudo cargar la tabla</p>
                      <p className="text-xs text-velum-500 max-w-sm">{error}</p>
                    </div>
                  </td>
                </tr>
              ) : isLoading ? (
                /* Estado: loading — 5 filas skeleton del color del sistema */
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skl-${i}`} className="border-b border-velum-100 last:border-b-0">
                    {visibleCols.map((col) => (
                      <td key={col.id} className={s.td}>
                        <div className="h-3 rounded skeleton" style={{ maxWidth: '70%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                /* Estado: empty */
                <tr>
                  <td colSpan={colCount} className="px-4 py-10">
                    {React.isValidElement(empty) ? (
                      empty
                    ) : empty && typeof empty === 'object' && 'title' in empty ? (
                      <EmptyState
                        title={(empty as { title: string }).title}
                        description={(empty as { description?: string }).description}
                      />
                    ) : (
                      <EmptyState
                        title={query ? 'Sin resultados' : 'Sin datos'}
                        description={
                          query
                            ? 'Intenta con otros términos de búsqueda.'
                            : 'No hay registros para mostrar todavía.'
                        }
                      />
                    )}
                  </td>
                </tr>
              ) : (
                /* Estado: data */
                sorted.map((row) => {
                  const key = rowKey(row);
                  const clickable = !!onRowClick;
                  return (
                    <tr
                      key={key}
                      onClick={clickable ? () => onRowClick!(row) : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onRowClick!(row);
                              }
                            }
                          : undefined
                      }
                      tabIndex={clickable ? 0 : undefined}
                      role={clickable ? 'button' : undefined}
                      className={[
                        'border-b border-velum-100 last:border-b-0',
                        clickable
                          ? 'cursor-pointer transition-colors duration-fast hover:bg-velum-50 focus:outline-none focus-visible:bg-velum-100'
                          : '',
                        rowClassName?.(row) ?? '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {visibleCols.map((col) => {
                        const content = col.cell ? col.cell(row) : (col.accessor(row) as React.ReactNode);
                        return (
                          <td
                            key={col.id}
                            className={[
                              s.td,
                              'text-velum-700',
                              col.align === 'right'
                                ? 'text-right tabular-nums'
                                : col.align === 'center'
                                  ? 'text-center'
                                  : '',
                              col.className ?? '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {content as React.ReactNode}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
