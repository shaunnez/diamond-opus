// SVG path data for diamond shapes - clean outline style
// All paths designed for a 48x48 viewBox

export interface ShapeDefinition {
  name: string;
  label: string;
  path: string;
  viewBox?: string;
}

export const DIAMOND_SHAPES: ShapeDefinition[] = [
  {
    name: 'ROUND',
    label: 'Round',
    path: 'M24 4 C35.05 4 44 12.95 44 24 C44 35.05 35.05 44 24 44 C12.95 44 4 35.05 4 24 C4 12.95 12.95 4 24 4 Z',
  },
  {
    name: 'OVAL',
    label: 'Oval',
    path: 'M24 3 C33 3 42 10.5 42 24 C42 37.5 33 45 24 45 C15 45 6 37.5 6 24 C6 10.5 15 3 24 3 Z',
  },
  {
    name: 'EMERALD',
    label: 'Emerald',
    path: 'M12 5 L36 5 L42 11 L42 37 L36 43 L12 43 L6 37 L6 11 Z',
  },
  {
    name: 'CUSHION',
    label: 'Cushion',
    path: 'M14 5 C9 5 5 9 5 14 L5 34 C5 39 9 43 14 43 L34 43 C39 43 43 39 43 34 L43 14 C43 9 39 5 34 5 Z',
  },
  {
    name: 'RADIANT',
    label: 'Radiant',
    path: 'M12 5 L36 5 L43 12 L43 36 L36 43 L12 43 L5 36 L5 12 Z',
  },
  {
    name: 'PRINCESS',
    label: 'Princess',
    path: 'M6 6 L42 6 L42 42 L6 42 Z',
  },
  {
    name: 'PEAR',
    label: 'Pear',
    path: 'M24 3 L38 22 C42 28 42 34 38 38 C34 42 28 45 24 45 C20 45 14 42 10 38 C6 34 6 28 10 22 Z',
  },
  {
    name: 'MARQUISE',
    label: 'Marquise',
    path: 'M24 2 C30 8 44 17 44 24 C44 31 30 40 24 46 C18 40 4 31 4 24 C4 17 18 8 24 2 Z',
  },
  {
    name: 'ASSCHER',
    label: 'Asscher',
    path: 'M14 5 L34 5 L43 14 L43 34 L34 43 L14 43 L5 34 L5 14 Z M14 5 L34 43 M34 5 L14 43 M5 14 L43 34 M43 14 L5 34',
  },
  {
    name: 'HEART',
    label: 'Heart',
    path: 'M24 44 L6 24 C2 18 2 12 6 8 C10 4 16 4 20 8 L24 12 L28 8 C32 4 38 4 42 8 C46 12 46 18 42 24 Z',
  },
  {
    name: 'ROSE',
    label: 'Rose',
    path: 'M24 4 C35.05 4 44 12.95 44 24 C44 35.05 35.05 44 24 44 C12.95 44 4 35.05 4 24 C4 12.95 12.95 4 24 4 Z M24 10 C24 10 18 16 18 22 C18 25.31 20.69 28 24 28 C27.31 28 30 25.31 30 22 C30 16 24 10 24 10 Z',
  },
  {
    name: 'OLD MINER',
    label: 'Old Miner',
    path: 'M16 5 C10 5 5 10 5 16 L5 32 C5 38 10 43 16 43 L32 43 C38 43 43 38 43 32 L43 16 C43 10 38 5 32 5 Z',
  },
  {
    name: 'TRILLIANT',
    label: 'Trilliant',
    path: 'M24 4 L44 40 L4 40 Z',
  },
  {
    name: 'HEXAGONAL',
    label: 'Hexagonal',
    path: 'M24 4 L40 14 L40 34 L24 44 L8 34 L8 14 Z',
  },
];

export const SHAPE_GROUPS: Record<string, string[]> = {
  'CUSHION': ['CUSHION', 'CUSHION B', 'CUSHION MODIFIED', 'CUSHION BRILLIANT'],
};

export function getShapeByName(name: string): ShapeDefinition | undefined {
  return DIAMOND_SHAPES.find((s) => s.name === name.toUpperCase());
}
