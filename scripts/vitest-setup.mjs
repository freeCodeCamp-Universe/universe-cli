import { generateLayerFiles } from "./generate-layer-files.mjs";

const setup = async () => {
  await generateLayerFiles();
};

export { setup };
