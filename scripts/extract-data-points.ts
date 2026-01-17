import fs from 'node:fs/promises';
import path from 'node:path';

type Feature = {
  name: string;
  description: string;
  groups: string[];
};

type FeatureSection = {
  _id: string;
  section: string;
  features: Feature[];
};

const extractStringLiteral = (source: string, startIndex: number): string => {
  let i = startIndex;
  const end = source.length;
  let result = '';
  while (i < end) {
    const char = source[i];
    if (char === '"') {
      const backslashes = source.slice(0, i).match(/\\+$/u);
      const isEscaped = backslashes ? backslashes[0].length % 2 === 1 : false;
      if (!isEscaped) {
        return result;
      }
    }
    result += char;
    i += 1;
  }
  throw new Error('Unterminated string literal.');
};

const extractJsonArray = (source: string, startIndex: number): string => {
  let i = startIndex;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  while (i < source.length) {
    const char = source[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === '\\') {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, i + 1);
      }
    }
    i += 1;
  }
  throw new Error('Unterminated JSON array.');
};

const run = async () => {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error('Usage: tsx scripts/extract-data-points.ts <input.html> <output.json>');
  }

  const html = await fs.readFile(inputPath, 'utf-8');
  const marker = '\\"features\\":[';
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error('Could not locate features array in HTML.');
  }

  const prefix = 'self.__next_f.push([1,"';
  const startIndex = html.lastIndexOf(prefix, markerIndex);
  if (startIndex === -1) {
    throw new Error('Could not locate Next.js payload string.');
  }

  const stringStart = startIndex + prefix.length;
  const stringLiteral = extractStringLiteral(html, stringStart);
  const unescaped = JSON.parse(`"${stringLiteral}"`) as string;

  const unescapedMarkerIndex = unescaped.indexOf('"features":[');
  if (unescapedMarkerIndex === -1) {
    throw new Error('Could not locate unescaped features array.');
  }

  const arrayStart = unescaped.indexOf('[', unescapedMarkerIndex);
  const arrayLiteral = extractJsonArray(unescaped, arrayStart);
  const sections = JSON.parse(arrayLiteral) as FeatureSection[];

  const output = {
    source: path.basename(inputPath),
    extractedAt: new Date().toISOString(),
    sectionCount: sections.length,
    featureCount: sections.reduce((total, section) => total + section.features.length, 0),
    sections,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${output.sectionCount} sections and ${output.featureCount} features to ${outputPath}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
