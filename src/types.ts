export type Difficulty = 'normal' | 'hard';

export type SuitColor = 'cyan' | 'red' | 'gold' | 'lime' | 'purple' | 'orange' | 'white' | 'dark';

export interface TaskState {
  node1Solved: boolean;
  node1Params: { u: number; f: number; i: number };

  node2Solved: boolean;
  node2Shift: number;
  node2Slots: number[];

  node3Solved: boolean;
  node3Time: number;

  node4Solved: boolean;
  node4MassA: number;

  node5Solved: boolean;
  node5Word: string;

  escaped: boolean;
}

export type ActiveTask = null | 1 | 2 | 3 | 4 | 5 | 6;

export type DoorId = 1 | 2 | 3 | 4 | 5;

export type UnlockedDoorsState = Record<DoorId, boolean>;

export interface RoomInfo {
  id: string;
  name: string;
  taskIndex: number;
  terminalX: number;
  terminalY: number;
  color: string;
  description: string;
}

