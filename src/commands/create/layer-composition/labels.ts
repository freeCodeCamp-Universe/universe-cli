import labelData from "./labels.json" with { type: "json" };

type LabelsData = typeof labelData;
export type LabelCategory = keyof LabelsData;

export const getLabel = <C extends LabelCategory>(category: C, key: string): string => {
  const categoryData = labelData[category];
  if (key in categoryData) {
    return categoryData[key as keyof typeof categoryData] as string;
  }

  return key;
};
