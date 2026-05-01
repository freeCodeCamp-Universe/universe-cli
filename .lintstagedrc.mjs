import path from "node:path";
import picomatch from "picomatch";

const removeFilesFolder = (files) => {
  const cwd = process.cwd();
  const relativePaths = files.map((file) => path.relative(cwd, file));
  const matcher = picomatch(["files/**"]);
  return relativePaths.filter((f) => !matcher(f));
};

// oxlint-disable-next-line import/no-default-export import/no-anonymous-default-export
export default {
  "*.{js,jsx,ts,tsx,mjs,cjs}": (files) => {
    const match = removeFilesFolder(files);
    if (match.length === 0) return [];
    const matchingFiles = match.join(" ");

    return [`oxlint --fix ${matchingFiles}`, `oxfmt ${matchingFiles}`];
  },

  "!*.{js,jsx,ts,tsx,mjs,cjs}": (files) => {
    // Filter out ignored files
    const match = removeFilesFolder(files);
    if (match.length === 0) return [];
    const matchingFiles = match.join(" ");

    return [`oxfmt --no-error-on-unmatched-pattern ${matchingFiles}`];
  },
};
