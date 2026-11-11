import { stateNameForFips } from "./stateFipsNames";

export type ExcludedGroup = { reason: string; count: number; states: string[] };

export function groupExcludedCounties(list: { fips: string; reason: string }[]): ExcludedGroup[] {
  const groups = new Map<string, ExcludedGroup>();
  for (const { fips, reason } of list) {
    let group = groups.get(reason);
    if (!group) {
      group = { reason, count: 0, states: [] };
      groups.set(reason, group);
    }
    group.count += 1;
    const state = stateNameForFips(fips);
    if (!group.states.includes(state)) group.states.push(state);
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0),
  );
}
