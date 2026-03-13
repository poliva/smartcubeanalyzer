import { Const } from "./Constants";
import { GetEmptySolve } from "./CubeHelpers";
import { Solve, CrossColor, MethodName, StepName } from "./Types";
import moment from 'moment';

const AUF_MOVES = new Set(['U', "U'", 'U2', "U2'", "U3", "U3'"]);

/** Returns duration in ms of leading AUF moves (U, U', U2, U2') from step_N_recorded_moves. */
function computeAufDurationMs(recordedMoves: string): number {
    if (!recordedMoves || !recordedMoves.trim()) return 0;
    const tokens = recordedMoves.trim().split(/\s+/);
    let firstAufTs: number | null = null;
    let lastAufTs: number | null = null;
    for (const token of tokens) {
        const m = token.match(/^(.+)\[(\d+)\]$/);
        if (!m) continue;
        const move = m[1];
        const ts = Number(m[2]);
        if (AUF_MOVES.has(move)) {
            if (firstAufTs == null) firstAufTs = ts;
            lastAufTs = ts;
        } else {
            if (firstAufTs != null) return Math.max(0, ts - firstAufTs);
            return 0;
        }
    }
    if (firstAufTs != null && lastAufTs != null) return Math.max(0, lastAufTs - firstAufTs);
    return 0;
}

const COMMA_PLACEHOLDER = '\x01';

function parseCubeastCsv(stringVal: string, splitter: string): Solve[] {

    // Replace commas inside [...] so split(splitter) does not break on e.g. step case "[FL,BR]->FR 30".
    // Preserves bracket content (including timestamps in step_N_recorded_moves) for AUF parsing.
    const normalized = stringVal.trim().replace(/\[[^\]]*\]/g, (m) => m.replace(/,/g, COMMA_PLACEHOLDER));

    const [keys, ...rest] = normalized
        .split("\n")
        .map((item) => item.split(splitter));

    const keyMap: { [key: string]: (obj: Solve, value: string) => void } = {
        "id": (obj, value) => { obj.id = value; obj.rawSourceId = value; obj.source = 'cubeast'; },
        "time": (obj, value) => { obj.time = Number(value) / 1000; if (obj.time < 1) obj.isCorrupt = true; },
        "date": (obj, value) => { obj.date = moment.utc(value, 'YYYY-MM-DD hh:mm:ss').toDate(); },
        "solution_rotation": (obj, value) => {
            obj.crossColor = Const.crossMappings.get(value) ?? CrossColor.Unknown;
            if (obj.crossColor == CrossColor.Unknown) {
                console.log("Unknown solution rotation: ", value);
                //obj.isCorrupt = true;
            };
        },
        "scramble": (obj, value) => { obj.scramble = value; },
        "solving_method": (obj, value) => { obj.method = value as MethodName; },
        "turns_per_second": (obj, value) => { obj.tps = Number(value); },
        "total_recognition_time": (obj, value) => { obj.recognitionTime = Number(value) / 1000; },
        "inspection_time": (obj, value) => { obj.inspectionTime = Number(value) / 1000; },
        "total_execution_time": (obj, value) => { obj.executionTime = Number(value) / 1000; },
        "slice_turns": (obj, value) => { obj.turns = Number(value); },
        "session_name": (obj, value) => { obj.session = value; },
    };

    const stepKeyMap: { [key: string]: (step: any, value: string) => void } = {
        "name": (step, value) => { step.name = value as StepName; },
        "slice_turns": (step, value) => { step.turns = Number(value); },
        "time": (step, value) => { step.time = Number(value) / 1000; },
        "case": (step, value) => { step.case = value ? value.split(COMMA_PLACEHOLDER).join(',') : value; },
        "turns_per_second": (step, value) => { step.tps = Number(value); },
        "recognition_time": (step, value) => { step.recognitionTime = Number(value) / 1000; },
        "execution_time": (step, value) => { step.executionTime = Number(value) / 1000; },
        "recorded_moves": (step, value) => {
            const aufMs = computeAufDurationMs(value);
            if (aufMs > 0) (step as any).aufDurationMs = aufMs;
        },
    };

    let formedArr = rest.map((item) => {
        let obj = GetEmptySolve();

        keys.forEach((key, index) => {
            if (key.startsWith("step_")) {
                const stepIndex = +key[5];
                const stepKey = key.split("_").slice(2).join("_");
                stepKeyMap[stepKey]?.(obj.steps[stepIndex], item[index]);
            } else {
                keyMap[key]?.(obj, item[index]);
            }
        });

        // Apply AUF adjustment: move leading AUF time from recognition to execution per step,
        // but do not apply this fix to the Cross step.
        const stepTimeMs = (s: { time: number }) => s.time * 1000;
        for (const step of obj.steps) {
            if (step.name === StepName.Cross) continue;
            const aufMs = (step as any).aufDurationMs as number | undefined;
            if (aufMs == null || aufMs <= 0) continue;
            const capMs = Math.min(aufMs, stepTimeMs(step));
            const deltaSec = capMs / 1000;
            step.recognitionTime = Math.max(0, step.recognitionTime - deltaSec);
            step.executionTime += deltaSec;
            delete (step as any).aufDurationMs;
        }
        obj.recognitionTime = obj.steps.reduce((s, st) => s + st.recognitionTime, 0);
        obj.executionTime = obj.steps.reduce((s, st) => s + st.executionTime, 0);

        obj.source = 'cubeast';
        obj.rawSource = 'cubeast';

        return obj;
    });

    formedArr = formedArr.sort((a: Solve, b: Solve) => {
        return a.date.getTime() - b.date.getTime();
    });

    return formedArr;
}

function parseAcubemyCsv(stringVal: string, splitter: string): Solve[] {
    const ROTATIONS = new Set([
        "x", "x'", "x2",
        "y", "y'", "y2",
        "z", "z'", "z2",
    ]);

    const countNonRotationMoves = (moves: string | undefined | null): number => {
        if (!moves) return 0;
        // Strip surrounding quotes Acubemy may add around move strings.
        const normalizedMoves = moves.trim().replace(/^"(.*)"$/, "$1");
        if (!normalizedMoves) return 0;
        const tokens = normalizedMoves
            .split(/\s+/)
            .filter((token) => token.length > 0);
        return tokens.filter((token) => !ROTATIONS.has(token.toLowerCase())).length;
    };
    const [keys, ...rows] = stringVal
        .trim()
        .split("\n")
        .map((item) => item.split(splitter));

    const indexOf = (name: string) => keys.indexOf(name);

    const formedArr = rows.map((item) => {
        const solve = GetEmptySolve();

        const get = (name: string) => {
            const idx = indexOf(name);
            return idx >= 0 ? item[idx] : "";
        };

        const getNumber = (name: string) => {
            const v = get(name);
            return v ? Number(v) : 0;
        };

        solve.source = 'acubemy';
        solve.rawSource = 'acubemy';

        const solveId = get("solve_id");
        solve.id = `acubemy-${solveId}`;
        solve.rawSourceId = solveId;

        const dateStr = get("date");
        if (dateStr) {
            solve.date = new Date(dateStr);
        }

        solve.time = getNumber("total_time") / 1000;
        if (solve.time < 1) {
            solve.isCorrupt = true;
        }

        solve.scramble = get("scramble");

        solve.session = get("session_name");

        const analysisType = get("analysis_type");
        if (analysisType && analysisType.toUpperCase().includes("CFOP")) {
            solve.method = MethodName.CFOP;
        }

        const crossFace = get("cross_face");
        if (crossFace) {
            switch (crossFace) {
                case "D":
                    solve.crossColor = CrossColor.White;
                    break;
                case "U":
                    solve.crossColor = CrossColor.Yellow;
                    break;
                case "F":
                    solve.crossColor = CrossColor.Green;
                    break;
                case "B":
                    solve.crossColor = CrossColor.Blue;
                    break;
                case "R":
                    solve.crossColor = CrossColor.Red;
                    break;
                case "L":
                    solve.crossColor = CrossColor.Orange;
                    break;
                default:
                    solve.crossColor = CrossColor.Unknown;
                    break;
            }
        }

        const ollCaseRaw = get("oll_case_id");
        const pllCaseRaw = get("pll_case_name");

        // map steps into existing array
        const steps = solve.steps;

        const setStep = (
            index: number,
            name: StepName,
            movesField: string,
            timeField: string,
            caseField?: string
        ) => {
            const moves = get(movesField);
            // Presence of a step is determined by moves; we do not trust or use
            // Acubemy's per-step time fields for timing and will recompute
            // timings from `solution` + `move_times` instead.
            if (!moves) {
                return;
            }
            const s = steps[index];
            s.name = name;
            s.moves = moves;
            // Step recognition/execution/time will be fully recomputed later
            // from `solution` + `move_times`, so initialize them to zero here.
            s.time = 0;
            s.recognitionTime = 0;
            s.executionTime = 0;
            // Count turns from move tokens, excluding rotations.
            s.turns = countNonRotationMoves(moves);
            // tps will also be recomputed once final step time is known.
            if (caseField) {
                s.case = get(caseField);
            }
        };

        setStep(0, StepName.Cross, "cross_moves", "cross_time");
        setStep(1, StepName.F2L_1, "f2l_pair1_moves", "f2l_pair1_time");
        setStep(2, StepName.F2L_2, "f2l_pair2_moves", "f2l_pair2_time");
        setStep(3, StepName.F2L_3, "f2l_pair3_moves", "f2l_pair3_time");
        setStep(4, StepName.F2L_4, "f2l_pair4_moves", "f2l_pair4_time");
        setStep(5, StepName.OLL, "oll_moves", "oll_time", "oll_case_id");
        setStep(6, StepName.PLL, "pll_moves", "pll_time", "pll_case_name");

        // Normalize Acubemy OLL/PLL skip encodings to the shared "Solved" case label,
        // so they behave like Cubeast data in filters and charts.
        const ollStep = steps[5];
        if (ollStep) {
            ollStep.name = StepName.OLL;
            if (ollCaseRaw) {
                ollStep.case = ollCaseRaw === "-1" ? "Solved" : ollCaseRaw;
            }
        }

        const pllStep = steps[6];
        if (pllStep) {
            pllStep.name = StepName.PLL;
            if (pllCaseRaw) {
                pllStep.case = pllCaseRaw === "Unknown" ? "Solved" : pllCaseRaw;
            }
        }

        // Recompute solve-level turns/tps from the full solution, ignoring rotations.
        const solutionMoves = get("solution") || get("raw_solution");
        const totalTurns = countNonRotationMoves(solutionMoves);
        solve.turns = totalTurns;
        if (solve.time > 0) {
            solve.tps = totalTurns / solve.time;
        } else {
            solve.tps = 0;
        }

        // Recompute step-level recognition/execution times from solution + move_times when possible.
        const moveTimesRaw = get("move_times");
        const canRecompute =
            !!solutionMoves &&
            !!moveTimesRaw &&
            moveTimesRaw.trim().length > 0;

        if (canRecompute) {
            const solutionTokens = solutionMoves
                .trim()
                .replace(/^"(.*)"$/, "$1")
                .split(/\s+/)
                .filter((t) => t.length > 0);

            const timeTokens = moveTimesRaw
                .trim()
                .replace(/^"(.*)"$/, "$1")
                .split(/\s+/)
                .filter((t) => t.length > 0)
                .map((t) => Number(t));

            if (solutionTokens.length === timeTokens.length && solutionTokens.length > 0) {
                type StepRange = {
                    startIdx: number;
                    endIdx: number;
                    firstNonIdx: number | null;
                    lastNonIdx: number | null;
                };

                const stepDefs: { index: number; movesField: string }[] = [
                    { index: 0, movesField: "cross_moves" },
                    { index: 1, movesField: "f2l_pair1_moves" },
                    { index: 2, movesField: "f2l_pair2_moves" },
                    { index: 3, movesField: "f2l_pair3_moves" },
                    { index: 4, movesField: "f2l_pair4_moves" },
                    { index: 5, movesField: "oll_moves" },
                    { index: 6, movesField: "pll_moves" },
                ];

                const matchStepRange = (
                    stepMoves: string,
                    searchFrom: number
                ): StepRange | null => {
                    const normalized = stepMoves.trim().replace(/^"(.*)"$/, "$1");
                    if (!normalized) return null;
                    const tokens = normalized
                        .split(/\s+/)
                        .filter((t) => t.length > 0);
                    if (tokens.length === 0) return null;
                    const first = tokens[0];
                    for (let i = searchFrom; i <= solutionTokens.length - tokens.length; i++) {
                        if (solutionTokens[i] !== first) continue;
                        let ok = true;
                        for (let j = 1; j < tokens.length; j++) {
                            if (solutionTokens[i + j] !== tokens[j]) {
                                ok = false;
                                break;
                            }
                        }
                        if (!ok) continue;
                        let firstNon: number | null = null;
                        let lastNon: number | null = null;
                        for (let k = 0; k < tokens.length; k++) {
                            const globalIdx = i + k;
                            const move = solutionTokens[globalIdx];
                            if (!ROTATIONS.has(move.toLowerCase())) {
                                if (firstNon == null) firstNon = globalIdx;
                                lastNon = globalIdx;
                            }
                        }
                        return {
                            startIdx: i,
                            endIdx: i + tokens.length - 1,
                            firstNonIdx: firstNon,
                            lastNonIdx: lastNon,
                        };
                    }
                    return null;
                };

                const stepRanges: (StepRange | null)[] = [];
                let searchFrom = 0;
                for (const def of stepDefs) {
                    const movesString = get(def.movesField);
                    const range = movesString ? matchStepRange(movesString, searchFrom) : null;
                    stepRanges[def.index] = range;
                    if (range) {
                        searchFrom = range.endIdx + 1;
                    }
                }

                let prevLastNonIdx: number | null = null;
                let accumulatedRecMs = 0;
                let accumulatedExecMs = 0;

                for (const def of stepDefs) {
                    const s = steps[def.index];
                    const range = stepRanges[def.index];

                    if (!range || range.firstNonIdx == null || range.lastNonIdx == null) {
                        s.recognitionTime = 0;
                        s.executionTime = 0;
                        s.time = 0;
                        s.tps = 0;
                        continue;
                    }

                    const execStartMs = timeTokens[range.firstNonIdx];
                    const execEndMs = timeTokens[range.lastNonIdx];
                    const execMs = Math.max(0, execEndMs - execStartMs);

                    let recStartMs: number;
                    if (prevLastNonIdx == null) {
                        recStartMs = timeTokens[0];
                    } else {
                        recStartMs = timeTokens[prevLastNonIdx];
                    }
                    const recEndMs = execStartMs;
                    const recMs = Math.max(0, recEndMs - recStartMs);

                    s.executionTime = execMs / 1000;
                    s.recognitionTime = recMs / 1000;
                    s.time = s.executionTime + s.recognitionTime;

                    if (s.time > 0 && s.turns > 0) {
                        s.tps = s.turns / s.time;
                    }

                    accumulatedExecMs += execMs;
                    accumulatedRecMs += recMs;
                    prevLastNonIdx = range.lastNonIdx;
                }

                solve.executionTime = accumulatedExecMs / 1000;
                solve.recognitionTime = accumulatedRecMs / 1000;
            }
        }

        return solve;
    });

    const sorted = formedArr.sort((a: Solve, b: Solve) => {
        return a.date.getTime() - b.date.getTime();
    });

    return sorted;
}

export function parseCsv(stringVal: string, splitter: string): Solve[] {
    const header = stringVal.trim().split("\n")[0];

    if (header.includes("id,date,dnf,time,solving_method")) {
        return parseCubeastCsv(stringVal, splitter);
    }

    if (header.includes("solve_id,date,total_time")) {
        return parseAcubemyCsv(stringVal, splitter);
    }

    // default to cubeast parser for backward compatibility
    return parseCubeastCsv(stringVal, splitter);
}