import { beforeAfterPattern } from "./beforeAfter";
import { beforeAfterHorizontalPattern } from "./beforeAfterHorizontal";
import { bulletMatrixPattern } from "./bulletMatrix";
import { chevronFlowPattern } from "./chevronFlow";
import { cyclePattern, cycleWithEntryPattern } from "./cycle";
import { flowSchedulePattern } from "./flowSchedule";
import { flowScheduleHorizontalPattern } from "./flowScheduleHorizontal";
import { gridMatrixPattern } from "./gridMatrix";
import { headingBulletsPattern } from "./headingBullets";
import { horizontalFlowPattern } from "./horizontalFlow";
import { logicTreePattern } from "./logicTree";
import { matrixPattern } from "./matrix";
import type { PatternDefinition, PatternId } from "./patternDefinition";
import { pyramidPattern } from "./pyramid";
import { pyramidChartPattern } from "./pyramidChart";
import { schedulePattern } from "./schedule";
import { timelinePattern } from "./timeline";
import { vennPattern } from "./venn";
import { verticalFlowPattern } from "./verticalFlow";

// Every pattern's definition, keyed by StructuredBlock["pattern"] - a Record
// over the whole union, so a newly added pattern id fails to compile until
// it's registered here.
const PATTERNS: Record<PatternId, PatternDefinition> = {
  pyramid: pyramidPattern,
  logicTree: logicTreePattern,
  matrix: matrixPattern,
  venn: vennPattern,
  headingBullets: headingBulletsPattern,
  bulletMatrix: bulletMatrixPattern,
  pyramidChart: pyramidChartPattern,
  schedule: schedulePattern,
  verticalFlow: verticalFlowPattern,
  horizontalFlow: horizontalFlowPattern,
  flowSchedule: flowSchedulePattern,
  flowScheduleHorizontal: flowScheduleHorizontalPattern,
  timeline: timelinePattern,
  beforeAfter: beforeAfterPattern,
  beforeAfterHorizontal: beforeAfterHorizontalPattern,
  chevronFlow: chevronFlowPattern,
  cycle: cyclePattern,
  cycleWithEntry: cycleWithEntryPattern,
  gridMatrix: gridMatrixPattern,
};

export function patternOf(id: PatternId): PatternDefinition {
  return PATTERNS[id];
}
