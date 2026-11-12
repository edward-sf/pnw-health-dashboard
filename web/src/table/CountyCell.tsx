type Props = {
  fips: string;
  name: string;
  state: string;
  selected: boolean;
  onSelect: (fips: string, opener: HTMLElement) => void;
};

/** The county-name cell of a table row: a button that selects the county and opens its panel. */
export function CountyCell({ fips, name, state, selected, onSelect }: Props) {
  return (
    <td>
      <button
        type="button"
        className="table-county"
        aria-label={`${name}, ${state}`}
        aria-current={selected ? "true" : undefined}
        onClick={(ev) => onSelect(fips, ev.currentTarget)}
      >
        {name}
      </button>
    </td>
  );
}
