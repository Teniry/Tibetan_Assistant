export interface ClassroomStudent {
    id: string;
    name: string;
    studentNo: string;
    group: string;
    createdAt: string;
}
interface RollCallHistoryItem {
    id: string;
    studentId: string;
    name: string;
    round: number;
    selectedAt: string;
}
interface ClassroomStore {
    version: 1;
    students: ClassroomStudent[];
    currentRound: number;
    calledStudentIds: string[];
    history: RollCallHistoryItem[];
}
export interface ClassroomView extends ClassroomStore {
    remainingCount: number;
    calledCount: number;
}
export declare function getClassroom(): ClassroomView;
export declare function addStudents(input: Array<{
    name?: unknown;
    studentNo?: unknown;
    group?: unknown;
}>, replace?: boolean): ClassroomView & {
    addedCount: number;
    skippedCount: number;
};
export declare function removeStudent(studentId: string): ClassroomView;
export declare function clearStudents(): ClassroomView;
export declare function drawRandomStudent(): ClassroomView & {
    selected: ClassroomStudent | null;
    roundComplete: boolean;
};
export declare function resetRound(): ClassroomView;
export declare function clearHistory(): ClassroomView;
export {};
