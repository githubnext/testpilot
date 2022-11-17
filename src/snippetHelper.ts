import levenshtein from "levenshtein";

type Partition = Set<string>;

export type SnippetMap = (functionName: string) => string[] | undefined;

export class Snippets {
  /** The maximum number of snippets we can comfortably handle. */
  MAX_SNIPPETS: number;

  /** A cache recording Levenshtein distance between pairs of strings. */
  distanceCache: Map<string, number>;

  constructor() {
    this.MAX_SNIPPETS = 50;
    this.distanceCache = new Map<string, number>();
  }

  /**
   * Create the partitions. Initially each snippet is in its own partition.
   * @param snippets The snippets to partition.
   * @returns The partitions.
   */
  createPartitions(snippets: Set<string>): Partition[] {
    return [...snippets].map((snippet) => new Set([snippet]));
  }

  /**
   * Compute the Levenshtein distance between two strings, utilizing a cache.
   */
  computeDistance(a: string, b: string): number {
    // construct key for cache; this isn't injective, but it's good enough for our purposes
    const key = `${a}|||${b}`;
    if (this.distanceCache.has(key)) {
      return this.distanceCache.get(key)!;
    } else {
      const distance = new levenshtein(a, b).distance;
      this.distanceCache.set(key, distance);
      return distance;
    }
  }

  /**
   * Determine the lowest Levenshtein distance between elements of two partitions.
   * @param partition1 The first partition to compare.
   * @param partition2 The second partition to compare.
   * @returns The lowest Levenshtein distance between elements of the two partitions.
   */
  comparePartitions(partition1: Partition, partition2: Partition): number {
    let lowestDistance = Number.MAX_VALUE;
    partition1.forEach((snippet1) => {
      partition2.forEach((snippet2) => {
        const distance = this.computeDistance(snippet1, snippet2);
        if (distance < lowestDistance) {
          lowestDistance = distance;
        }
      });
    });
    return lowestDistance;
  }

  /**
   * Merge the two partitions with the lowest Levenshtein distance between them.
   * @param partitions The partitions.
   * @returns The partitions after merging.
   */
  mergeMostSimilarPartitions(partitions: Partition[]): Partition[] {
    let index1 = -1;
    let index2 = -1;
    let mostSimilarDistance = Number.MAX_VALUE;
    for (let i = 0; i < partitions.length; i++) {
      for (let j = i + 1; j < partitions.length; j++) {
        const distance = this.comparePartitions(partitions[i], partitions[j]);
        if (distance < mostSimilarDistance) {
          index1 = i;
          index2 = j;
          mostSimilarDistance = distance;
        }
      }
    }
    if (index1 !== -1 && index2 !== -1) {
      const mergedPartition = new Set([
        ...partitions[index1],
        ...partitions[index2],
      ]);
      partitions.splice(Math.max(index1, index2), 1); // make sure to remove the element at the larger index first
      partitions.splice(Math.min(index1, index2), 1);
      partitions.push(mergedPartition);

      index1 = -1;
      index2 = -1;
    } else {
      throw new Error();
    }
    return partitions;
  }

  /**
   * Select a set of representative snippets. This is done by grouping
   * the snippets into partitions so that the elements of each partition
   * are as similar as possible, and then selecting the smallest snippet
   * from each partition.
   * @param snippets The snippets to select representatives for.
   * @returns The selected snippets.
   */
  selectSnippets(snippets: Set<string>, n: number): Set<string> {
    // create partitions: initially, each snippet is in its own partition
    let partitions = this.createPartitions(snippets);

    // while we have too many partitions, merge the most similar ones
    while (partitions.length > n) {
      partitions = this.mergeMostSimilarPartitions(partitions);
    }

    // find shortest snippet in each partition and add it to the selected snippets
    const selectedSnippets = new Set<string>();
    for (let i = 0; i < partitions.length; i++) {
      let shortestSnippet = "";
      let shortestSnippetLength = Number.MAX_VALUE;
      partitions[i].forEach((snippet) => {
        if (snippet.length < shortestSnippetLength) {
          shortestSnippet = snippet;
          shortestSnippetLength = snippet.length;
        }
      });
      selectedSnippets.add(shortestSnippet);
    }
    return selectedSnippets;
  }
}
