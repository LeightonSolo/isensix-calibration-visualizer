/**
 * Assign overlapping event spans to visual lanes.
 *
 * Lane counts are scoped to each connected overlap group. An overlap later in
 * the visible range must not shrink unrelated events that occur earlier.
 */
export function buildTechSpans(events, assignments, dayStrs) {
  const visibleDayIndexes = new Map(dayStrs.map((date, index) => [date, index]));
  const eventsById = new Map((events || []).map(event => [String(event.id), event]));
  const grouped = new Map();

  (assignments || []).forEach(assignment => {
    const dateIndex = visibleDayIndexes.get(assignment.date);
    const event = eventsById.get(String(assignment.event_id));
    if (dateIndex === undefined || !event) return;
    if (assignment.date < event.start_date || assignment.date > event.end_date) return;

    const key = `${assignment.tech_name}\u0000${event.id}`;
    if (!grouped.has(key)) grouped.set(key, { tech: assignment.tech_name, event, dates: new Set() });
    grouped.get(key).dates.add(assignment.date);
  });

  const spans = {};
  grouped.forEach(({ tech, event, dates }) => {
    const sorted = [...dates].sort((a, b) => visibleDayIndexes.get(a) - visibleDayIndexes.get(b));
    let run = [];
    sorted.forEach(date => {
      const previous = run[run.length - 1];
      if (previous !== undefined && visibleDayIndexes.get(date) !== visibleDayIndexes.get(previous) + 1) {
        if (!spans[tech]) spans[tech] = [];
        spans[tech].push({ event, dates: run });
        run = [];
      }
      run.push(date);
    });
    if (run.length) {
      if (!spans[tech]) spans[tech] = [];
      spans[tech].push({ event, dates: run });
    }
  });

  return spans;
}

export function horizontalLaneStyle(lane, totalLanes) {
  const laneCount = Math.max(1, totalLanes || 1);
  const round = value => Number(value.toFixed(6));
  const laneWidth = round(100 / laneCount);
  const leftPercent = round(lane * 100 / laneCount);
  const widthGutter = round(2 / laneCount);
  const leftGutter = round(1 - (2 * lane / laneCount));
  const leftOperator = leftGutter < 0 ? '-' : '+';
  return {
    left: `calc(${leftPercent}% ${leftOperator} ${Math.abs(leftGutter)}px)`,
    width: `calc(${laneWidth}% - ${widthGutter}px)`,
  };
}

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
