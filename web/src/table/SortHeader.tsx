import type { Sort } from "./sortRows";

type Props<K extends string> = {
  sortKey: K;
  label: string;
  sort: Sort<K>;
  onSort: (next: Sort<K>) => void;
};

/**
 * A sortable column header. Clicking the active column flips its direction; clicking another
 * column sorts by it ascending. Shared by the county and model tables so `aria-sort` can't drift.
 */
export function SortHeader<K extends string>({ sortKey, label, sort, onSort }: Props<K>) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="sort-button"
        onClick={() =>
          onSort(
            active
              ? { key: sortKey, dir: sort.dir === "asc" ? "desc" : "asc" }
              : { key: sortKey, dir: "asc" },
          )
        }
      >
        {label}
      </button>
    </th>
  );
}
