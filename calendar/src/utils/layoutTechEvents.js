/**
 * Assign overlapping event spans to visual lanes.
 *
 * Lane counts are scoped to each connected overlap group. An overlap later in
 * the visible range must not shrink unrelated events that occur earlier.
 */
export function layoutTechEvents(spanList, dayStrs) {
  if (!spanList?.length) return [];

  const sorted = [...spanList].sort((a, b) =>
    a.dates[0].localeCompare(b.dates[0])
  );
  const result = [];
  let component = [];
  let componentEnd = -1;
  let laneEnds = [];

  const flushComponent = () => {
    if (!component.length) return;
    const totalLanes = laneEnds.length;
    component.forEach(span => result.push({ ...span, totalLanes }));
    component = [];
    componentEnd = -1;
    laneEnds = [];
  };

  sorted.forEach(span => {
    const startI = dayStrs.indexOf(span.dates[0]);
    const endI = dayStrs.indexOf(span.dates[span.dates.length - 1]);

    if (component.length && startI > componentEnd) {
      flushComponent();
    }

    let lane = laneEnds.findIndex(laneEnd => laneEnd < startI);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endI;
    component.push({ ...span, lane });
    componentEnd = Math.max(componentEnd, endI);
  });

  flushComponent();
  return result;
}
