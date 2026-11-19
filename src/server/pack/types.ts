// Schéma de story.json au format STUdio v1 (contracts/studio-pack.md).

export type Transition = { actionNode: string; optionIndex: number };

export type ControlSettings = { wheel: boolean; ok: boolean; home: boolean; pause: boolean; autoplay: boolean };

export type StageNode = {
  uuid: string;
  type: "stage";
  name: string;
  squareOne: boolean;
  image: string | null;
  audio: string | null;
  okTransition: Transition | null;
  homeTransition: Transition | null;
  controlSettings: ControlSettings;
  position: { x: number; y: number };
};

export type ActionNode = {
  id: string;
  name: string;
  options: string[];
  position: { x: number; y: number };
};

export type StoryPack = {
  format: "v1";
  title: string;
  description: string;
  version: number;
  nightModeAvailable: boolean;
  stageNodes: StageNode[];
  actionNodes: ActionNode[];
};
