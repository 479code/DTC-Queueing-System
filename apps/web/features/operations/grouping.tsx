import type { ReactNode } from "react";

export { STATUS_ORDER, groupByStatus, statusLabel, type StatusGroup } from "@refinery/shared";

/** A header row that names a group of rows and counts it. */
export function GroupRow({ label, count, columns }: { label: string; count: number; columns: number }): ReactNode {
  return (
    <tr className="groupRow">
      <th colSpan={columns} scope="colgroup">
        <span>{label}</span>
        <span className="groupCount">{count}</span>
      </th>
    </tr>
  );
}
