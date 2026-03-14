import { AUF_MOVES, tokenizeMoves } from "./CsvParser";
import { AufInefficiency, CaseStats, MoveAnalysisResult, RedundantPair, Solve, SolveEfficiency, Step } from "./Types";

/**
 * Parses a single move token into its face (including wide-move prefix)
 * and a mod-4 quarter-turn value.
 * Returns null for rotations (x, y, z) or unrecognised tokens.
 */
function parseMoveToken(token: string): { face: string; quarterTurns: number } | null {
    const m = token.match(/^([RLUDFBrludfbMESxyz]w?)([2']?)$/);
    if (!m) {
        const m2 = token.match(/^([RLUDFBrludfbMESxyz]w?)(2'|3'?)$/);
        if (!m2) return null;
        const face = m2[1];
        const suffix = m2[2];
        if (suffix === "2'" || suffix === "2") return { face, quarterTurns: 2 };
        if (suffix === "3'" || suffix === "3") return { face, quarterTurns: 3 };
        return null;
    }
    const face = m[1];
    const suffix = m[2];
    if (suffix === "") return { face, quarterTurns: 1 };
    if (suffix === "'") return { face, quarterTurns: 3 };
    if (suffix === "2") return { face, quarterTurns: 2 };
    return null;
}

function quarterTurnsToSliceTurns(qt: number): number {
    const mod = ((qt % 4) + 4) % 4;
    if (mod === 0) return 0;
    if (mod === 2) return 1;
    return 1; // mod 1 or 3 → single slice turn
}

function quarterTurnsToNotation(face: string, qt: number): string {
    const mod = ((qt % 4) + 4) % 4;
    if (mod === 1) return face;
    if (mod === 2) return face + "2";
    if (mod === 3) return face + "'";
    return "";
}

export function analyzeStepMoves(movesString: string): MoveAnalysisResult {
    const tokens = tokenizeMoves(movesString);
    if (tokens.length === 0) {
        return { originalTurns: 0, simplifiedTurns: 0, wastedMoves: 0, redundantPairs: [] };
    }

    type ParsedMove = { face: string; quarterTurns: number; originalIdx: number; originalToken: string };
    const parsed: ParsedMove[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const p = parseMoveToken(tokens[i]);
        if (p) {
            parsed.push({ face: p.face, quarterTurns: p.quarterTurns, originalIdx: i, originalToken: tokens[i] });
        }
    }

    const originalTurns = parsed.reduce((sum, m) => sum + quarterTurnsToSliceTurns(m.quarterTurns), 0);

    const simplified: ParsedMove[] = [];
    const redundantPairs: RedundantPair[] = [];

    for (let i = 0; i < parsed.length; i++) {
        if (simplified.length > 0 && simplified[simplified.length - 1].face === parsed[i].face) {
            const prev = simplified[simplified.length - 1];
            const combined = (prev.quarterTurns + parsed[i].quarterTurns) % 4;

            const startIdx = prev.originalIdx;
            const endIdx = parsed[i].originalIdx;
            const pairMoves = tokens.slice(startIdx, endIdx + 1).join(" ");

            if (combined === 0) {
                redundantPairs.push({ startIdx, endIdx, moves: pairMoves });
                simplified.pop();
            } else {
                const prevSlice = quarterTurnsToSliceTurns(prev.quarterTurns);
                const curSlice = quarterTurnsToSliceTurns(parsed[i].quarterTurns);
                const newSlice = quarterTurnsToSliceTurns(combined);
                if (newSlice < prevSlice + curSlice) {
                    redundantPairs.push({ startIdx, endIdx, moves: pairMoves });
                }
                prev.quarterTurns = combined;
                prev.originalToken = quarterTurnsToNotation(prev.face, combined);
            }
        } else {
            simplified.push({ ...parsed[i] });
        }
    }

    const simplifiedTurns = simplified.reduce((sum, m) => sum + quarterTurnsToSliceTurns(m.quarterTurns), 0);
    const wastedMoves = originalTurns - simplifiedTurns;

    return { originalTurns, simplifiedTurns, wastedMoves, redundantPairs };
}

function countAufMoves(tokens: string[], direction: 'leading' | 'trailing'): number {
    let count = 0;
    if (direction === 'leading') {
        for (const t of tokens) {
            if (AUF_MOVES.has(t)) count++;
            else break;
        }
    } else {
        for (let i = tokens.length - 1; i >= 0; i--) {
            if (AUF_MOVES.has(tokens[i])) count++;
            else break;
        }
    }
    return count;
}

function coreMovesCount(movesString: string): number {
    const tokens = tokenizeMoves(movesString);
    if (tokens.length === 0) return 0;
    const leadingAuf = countAufMoves(tokens, 'leading');
    const trailingAuf = countAufMoves(tokens, 'trailing');
    const coreEnd = tokens.length - trailingAuf;
    const coreStart = leadingAuf;
    return Math.max(0, coreEnd - coreStart);
}

export function computeCaseFailureStats(
    solves: Solve[],
    stepIndex: number
): CaseStats[] {
    type CaseInstance = { solveId: string; coreMoves: number; totalTurns: number };
    const caseMap: { [caseName: string]: CaseInstance[] } = {};

    for (const solve of solves) {
        const step = solve.steps[stepIndex];
        if (!step || !step.case) continue;

        const caseName = step.case;
        if (!(caseName in caseMap)) caseMap[caseName] = [];
        const core = coreMovesCount(step.moves);
        caseMap[caseName].push({ solveId: solve.id, coreMoves: core, totalTurns: step.turns });
    }

    const results: CaseStats[] = [];
    const caseNames = Object.keys(caseMap);

    for (const caseName of caseNames) {
        if (caseName === "Solved") continue;
        const instances = caseMap[caseName];

        const moveCounts = instances.map((i: CaseInstance) => i.coreMoves).sort((a: number, b: number) => a - b);
        const p90Idx = Math.min(Math.floor(moveCounts.length * 0.9), moveCounts.length - 1);
        const expectedMoves = moveCounts[p90Idx];

        const avgMoves = moveCounts.reduce((a: number, b: number) => a + b, 0) / moveCounts.length;

        let failureCount = 0;
        const taggedInstances = instances.map((inst: CaseInstance) => {
            const failed = inst.coreMoves > expectedMoves;
            if (failed) failureCount++;
            return { solveId: inst.solveId, turns: inst.totalTurns, failed };
        });

        results.push({
            caseName,
            totalCount: instances.length,
            failureCount,
            failureRate: instances.length > 0 ? (failureCount / instances.length) * 100 : 0,
            avgMoves,
            expectedMoves,
            instances: taggedInstances,
        });
    }

    results.sort((a, b) => b.failureRate - a.failureRate);
    return results;
}

export function computeAufInefficiency(step: Step): AufInefficiency {
    const tokens = tokenizeMoves(step.moves);
    const preAufMoves = countAufMoves(tokens, 'leading');
    const postAufMoves = countAufMoves(tokens, 'trailing');
    const totalAufTime = step.preAufTime + step.postAufTime;
    const isHighCost = (preAufMoves + postAufMoves) > 2 || totalAufTime > 0.5;

    return { preAufMoves, postAufMoves, totalAufTime, isHighCost };
}

export function computeSolveEfficiency(
    solve: Solve,
    ollCaseStats?: Map<string, CaseStats>,
    pllCaseStats?: Map<string, CaseStats>
): SolveEfficiency {
    let totalOriginal = 0;
    let totalSimplified = 0;

    for (const step of solve.steps) {
        if (!step.moves) continue;
        const analysis = analyzeStepMoves(step.moves);
        totalOriginal += analysis.originalTurns;
        totalSimplified += analysis.simplifiedTurns;
    }

    const moveEfficiency = totalOriginal > 0 ? totalSimplified / totalOriginal : 1;

    let hadOllFailure = false;
    let hadPllFailure = false;

    const ollStep = solve.steps[5];
    if (ollStep && ollStep.case && ollCaseStats) {
        const stats = ollCaseStats.get(ollStep.case);
        if (stats) {
            const core = coreMovesCount(ollStep.moves);
            hadOllFailure = core > stats.expectedMoves;
        }
    }

    const pllStep = solve.steps[6];
    if (pllStep && pllStep.case && pllCaseStats) {
        const stats = pllCaseStats.get(pllStep.case);
        if (stats) {
            const core = coreMovesCount(pllStep.moves);
            hadPllFailure = core > stats.expectedMoves;
        }
    }

    return { moveEfficiency, hadOllFailure, hadPllFailure };
}
