/**
 * Transcript Validator
 *
 * Validates STT output against ground truth transcripts.
 * Calculates Word Error Rate (WER) and provides detailed diff analysis.
 */

export interface ValidationOptions {
  wordErrorRateThreshold?: number;
  allowSynonyms?: boolean;
  caseSensitive?: boolean;
  ignorePunctuation?: boolean;
  ignoreFillerWords?: boolean;
}

export interface ValidationResult {
  pass: boolean;
  wordErrorRate: number;
  actual: string;
  expected: string;
  differences: Difference[];
  stats: {
    insertions: number;
    deletions: number;
    substitutions: number;
    totalWords: number;
  };
}

export interface Difference {
  type: 'insertion' | 'deletion' | 'substitution';
  position: number;
  expected?: string;
  actual?: string;
}

// Common filler words to optionally ignore
const FILLER_WORDS = new Set([
  'um', 'uh', 'er', 'ah', 'like', 'you know', 'actually', 'basically',
  'literally', 'honestly', 'obviously', 'right', 'so', 'well', 'anyway'
]);

// Common synonyms that should be treated as equivalent
const SYNONYMS: Record<string, string[]> = {
  'okay': ['ok', 'k', 'alright'],
  'yes': ['yeah', 'yep', 'yup', 'uh-huh'],
  'no': ['nope', 'nah'],
  'cannot': ["can't", 'cant'],
  'will not': ["won't", 'wont'],
  'it is': ["it's", 'its'],
  'i am': ["i'm", 'im'],
  'they are': ["they're", 'theyre'],
};

/**
 * TranscriptValidator compares STT output against expected transcripts
 */
export class TranscriptValidator {
  private synonymMap: Map<string, string>;

  constructor() {
    // Build reverse synonym map for normalization
    this.synonymMap = new Map();
    for (const [canonical, variants] of Object.entries(SYNONYMS)) {
      for (const variant of variants) {
        this.synonymMap.set(variant.toLowerCase(), canonical);
      }
    }
  }

  /**
   * Validate STT output against expected transcript
   */
  validate(
    actual: string,
    expected: string,
    options: ValidationOptions = {}
  ): ValidationResult {
    const {
      wordErrorRateThreshold = 0.1,
      allowSynonyms = true,
      caseSensitive = false,
      ignorePunctuation = true,
      ignoreFillerWords = false,
    } = options;

    // Normalize both strings
    const actualNormalized = this.normalize(actual, {
      caseSensitive,
      ignorePunctuation,
      ignoreFillerWords,
      allowSynonyms,
    });
    const expectedNormalized = this.normalize(expected, {
      caseSensitive,
      ignorePunctuation,
      ignoreFillerWords,
      allowSynonyms,
    });

    // Calculate WER and get edit operations
    const { wer, operations } = this.calculateWER(actualNormalized, expectedNormalized);
    const differences = this.findDifferences(actualNormalized, expectedNormalized, operations);

    // Count operation types
    const stats = {
      insertions: operations.filter(op => op === 'i').length,
      deletions: operations.filter(op => op === 'd').length,
      substitutions: operations.filter(op => op === 's').length,
      totalWords: expectedNormalized.split(/\s+/).filter(w => w).length,
    };

    return {
      pass: wer <= wordErrorRateThreshold,
      wordErrorRate: wer,
      actual: actualNormalized,
      expected: expectedNormalized,
      differences,
      stats,
    };
  }

  /**
   * Normalize text for comparison
   */
  private normalize(
    text: string,
    options: {
      caseSensitive: boolean;
      ignorePunctuation: boolean;
      ignoreFillerWords: boolean;
      allowSynonyms: boolean;
    }
  ): string {
    let normalized = text;

    // Remove punctuation if requested
    if (options.ignorePunctuation) {
      normalized = normalized.replace(/[.,!?;:'"()[\]{}]/g, '');
    }

    // Case normalization
    if (!options.caseSensitive) {
      normalized = normalized.toLowerCase();
    }

    // Split into words
    let words = normalized.split(/\s+/).filter(w => w);

    // Remove filler words if requested
    if (options.ignoreFillerWords) {
      words = words.filter(w => !FILLER_WORDS.has(w.toLowerCase()));
    }

    // Apply synonym normalization
    if (options.allowSynonyms) {
      words = words.map(w => this.synonymMap.get(w.toLowerCase()) || w);
    }

    return words.join(' ');
  }

  /**
   * Calculate Word Error Rate using Levenshtein distance
   */
  private calculateWER(actual: string, expected: string): { wer: number; operations: string[] } {
    const actualWords = actual.split(/\s+/).filter(w => w);
    const expectedWords = expected.split(/\s+/).filter(w => w);

    if (expectedWords.length === 0) {
      return { wer: actualWords.length > 0 ? 1 : 0, operations: [] };
    }

    // Dynamic programming matrix for edit distance
    const m = actualWords.length;
    const n = expectedWords.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    const ops: string[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(''));

    // Initialize base cases
    for (let i = 0; i <= m; i++) {
      dp[i][0] = i;
      ops[i][0] = 'd'.repeat(i);
    }
    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
      ops[0][j] = 'i'.repeat(j);
    }

    // Fill the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (actualWords[i - 1] === expectedWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
          ops[i][j] = ops[i - 1][j - 1] + 'm'; // match
        } else {
          const substitution = dp[i - 1][j - 1] + 1;
          const insertion = dp[i][j - 1] + 1;
          const deletion = dp[i - 1][j] + 1;

          if (substitution <= insertion && substitution <= deletion) {
            dp[i][j] = substitution;
            ops[i][j] = ops[i - 1][j - 1] + 's';
          } else if (insertion <= deletion) {
            dp[i][j] = insertion;
            ops[i][j] = ops[i][j - 1] + 'i';
          } else {
            dp[i][j] = deletion;
            ops[i][j] = ops[i - 1][j] + 'd';
          }
        }
      }
    }

    const distance = dp[m][n];
    const wer = distance / n;

    return { wer, operations: ops[m][n].split('') };
  }

  /**
   * Find specific differences between actual and expected
   */
  private findDifferences(
    actual: string,
    expected: string,
    operations: string[]
  ): Difference[] {
    const actualWords = actual.split(/\s+/).filter(w => w);
    const expectedWords = expected.split(/\s+/).filter(w => w);
    const differences: Difference[] = [];

    let actualIdx = 0;
    let expectedIdx = 0;

    for (const op of operations) {
      switch (op) {
        case 's': // substitution
          differences.push({
            type: 'substitution',
            position: expectedIdx,
            expected: expectedWords[expectedIdx],
            actual: actualWords[actualIdx],
          });
          actualIdx++;
          expectedIdx++;
          break;
        case 'i': // insertion (word in expected but not in actual)
          differences.push({
            type: 'deletion',
            position: expectedIdx,
            expected: expectedWords[expectedIdx],
          });
          expectedIdx++;
          break;
        case 'd': // deletion (word in actual but not in expected)
          differences.push({
            type: 'insertion',
            position: expectedIdx,
            actual: actualWords[actualIdx],
          });
          actualIdx++;
          break;
        case 'm': // match
          actualIdx++;
          expectedIdx++;
          break;
      }
    }

    return differences;
  }

  /**
   * Format validation result as human-readable string
   */
  formatResult(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push(`Word Error Rate: ${(result.wordErrorRate * 100).toFixed(1)}%`);
    lines.push(`Status: ${result.pass ? 'PASS' : 'FAIL'}`);
    lines.push('');
    lines.push(`Expected: "${result.expected}"`);
    lines.push(`Actual:   "${result.actual}"`);

    if (result.differences.length > 0) {
      lines.push('');
      lines.push('Differences:');
      for (const diff of result.differences) {
        switch (diff.type) {
          case 'substitution':
            lines.push(`  [${diff.position}] '${diff.expected}' → '${diff.actual}'`);
            break;
          case 'deletion':
            lines.push(`  [${diff.position}] Missing: '${diff.expected}'`);
            break;
          case 'insertion':
            lines.push(`  [${diff.position}] Extra: '${diff.actual}'`);
            break;
        }
      }
    }

    lines.push('');
    lines.push(`Stats: ${result.stats.substitutions} substitutions, ` +
      `${result.stats.deletions} deletions, ${result.stats.insertions} insertions ` +
      `(${result.stats.totalWords} total words)`);

    return lines.join('\n');
  }
}

export default TranscriptValidator;
