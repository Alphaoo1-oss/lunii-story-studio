import yauzl from "yauzl";

// Relit une archive en mémoire : nom d'entrée → contenu.
export async function readZip(path: string): Promise<Map<string, Buffer>> {
  const zip = await yauzl.openPromise(path);
  const entries = new Map<string, Buffer>();
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName.endsWith("/")) continue;
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      entries.set(entry.fileName, Buffer.concat(chunks));
    }
  } finally {
    zip.close();
  }
  return entries;
}
