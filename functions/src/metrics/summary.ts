export function fifoCompliancePercent(fifoProgrammingCount: number, bypassProgrammingCount: number): number {
  const total = fifoProgrammingCount + bypassProgrammingCount;
  return total === 0 ? 100 : Math.round((fifoProgrammingCount / total) * 100);
}

export function averageMinutes(values: number[]): number {
  return values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function longestMinutes(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}
