import type { Labels } from "./schemas/labels.js";

type LabelCategory = keyof Labels;

const getLabel = <C extends LabelCategory>(labels: Labels, category: C, key: string): string => {
  const categoryData = labels[category];
  if (categoryData !== undefined && key in categoryData) {
    return categoryData[key as keyof typeof categoryData] as string;
  }

  return key;
};

export { getLabel };
export type { LabelCategory };
