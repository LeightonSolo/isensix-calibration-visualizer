export type TravelCompletionItem = {
  kind: string;
  technician?: string | null;
  status: string;
};

const COMPLETED_STATUSES = new Set(['booked', 'not_needed']);

function normalizeTechnician(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isTravelComplete(
  assignedTechnicians: string[],
  items: TravelCompletionItem[],
) {
  const technicians = [...new Set(assignedTechnicians.map(normalizeTechnician).filter(Boolean))];
  if (!technicians.length) return false;

  const isCompleted = (item: TravelCompletionItem) => COMPLETED_STATUSES.has(String(item.status));
  const carComplete = items.some(item => item.kind === 'car' && isCompleted(item));
  const technicianKindComplete = (kind: string) => technicians.every(technician =>
    items.some(item => {
      if (item.kind !== kind || !isCompleted(item)) return false;
      const itemTechnician = normalizeTechnician(item.technician);
      return !itemTechnician || itemTechnician === technician;
    })
  );

  return carComplete
    && technicianKindComplete('hotel')
    && technicianKindComplete('flight');
}
