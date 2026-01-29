/**
 * Audio Comparator
 *
 * Compares audio outputs for similarity testing.
 * Useful for validating TTS consistency and regression testing.
 */

export interface ComparisonResult {
  similarity: number; // 0-1 score
  pass: boolean;
  metrics: {
    rmseDifference: number;
    correlationCoefficient: number;
    durationDifferenceMs: number;
    spectralSimilarity?: number;
  };
  details?: string;
}

export interface ComparisonOptions {
  similarityThreshold?: number; // 0-1, default 0.8
  allowDurationVariance?: number; // percentage, default 0.1 (10%)
  useSpectralAnalysis?: boolean;
  sampleRate?: number;
}

/**
 * Parse WAV header to extract audio parameters
 */
function parseWavHeader(buffer: ArrayBuffer): {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  dataOffset: number;
  dataLength: number;
} {
  const view = new DataView(buffer);

  // Verify RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') {
    throw new Error('Invalid WAV file: missing RIFF header');
  }

  const sampleRate = view.getUint32(24, true);
  const channels = view.getUint16(22, true);
  const bitDepth = view.getUint16(34, true);

  // Find data chunk
  let dataOffset = 12;
  while (dataOffset < buffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(dataOffset),
      view.getUint8(dataOffset + 1),
      view.getUint8(dataOffset + 2),
      view.getUint8(dataOffset + 3)
    );
    const chunkSize = view.getUint32(dataOffset + 4, true);

    if (chunkId === 'data') {
      return {
        sampleRate,
        channels,
        bitDepth,
        dataOffset: dataOffset + 8,
        dataLength: chunkSize,
      };
    }
    dataOffset += 8 + chunkSize;
  }

  // Default to standard header size if data chunk not found
  return {
    sampleRate,
    channels,
    bitDepth,
    dataOffset: 44,
    dataLength: buffer.byteLength - 44,
  };
}

/**
 * Extract samples from WAV buffer
 */
function extractSamples(buffer: ArrayBuffer): Float32Array {
  const header = parseWavHeader(buffer);
  const view = new DataView(buffer);

  const samplesCount = header.dataLength / (header.bitDepth / 8);
  const samples = new Float32Array(samplesCount);

  for (let i = 0; i < samplesCount; i++) {
    const offset = header.dataOffset + i * (header.bitDepth / 8);
    if (header.bitDepth === 16) {
      samples[i] = view.getInt16(offset, true) / 32768;
    } else if (header.bitDepth === 8) {
      samples[i] = (view.getUint8(offset) - 128) / 128;
    }
  }

  return samples;
}

/**
 * Calculate Root Mean Square Error between two sample arrays
 */
function calculateRMSE(a: Float32Array, b: Float32Array): number {
  const minLength = Math.min(a.length, b.length);
  let sumSquaredError = 0;

  for (let i = 0; i < minLength; i++) {
    const error = a[i] - b[i];
    sumSquaredError += error * error;
  }

  return Math.sqrt(sumSquaredError / minLength);
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(a: Float32Array, b: Float32Array): number {
  const minLength = Math.min(a.length, b.length);

  // Calculate means
  let sumA = 0, sumB = 0;
  for (let i = 0; i < minLength; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / minLength;
  const meanB = sumB / minLength;

  // Calculate correlation
  let sumProduct = 0, sumSqA = 0, sumSqB = 0;
  for (let i = 0; i < minLength; i++) {
    const diffA = a[i] - meanA;
    const diffB = b[i] - meanB;
    sumProduct += diffA * diffB;
    sumSqA += diffA * diffA;
    sumSqB += diffB * diffB;
  }

  const denominator = Math.sqrt(sumSqA * sumSqB);
  if (denominator === 0) return 0;

  return sumProduct / denominator;
}

/**
 * Simple spectral analysis using FFT approximation
 * Returns frequency-domain energy distribution
 */
function calculateSpectralEnergy(samples: Float32Array, windowSize: number = 1024): Float32Array {
  const numWindows = Math.floor(samples.length / windowSize);
  const energy = new Float32Array(windowSize / 2);

  for (let w = 0; w < numWindows; w++) {
    const offset = w * windowSize;

    // Simple DFT for each window (not optimized, but works for testing)
    for (let k = 0; k < windowSize / 2; k++) {
      let real = 0, imag = 0;
      for (let n = 0; n < windowSize; n++) {
        const angle = (2 * Math.PI * k * n) / windowSize;
        real += samples[offset + n] * Math.cos(angle);
        imag -= samples[offset + n] * Math.sin(angle);
      }
      energy[k] += Math.sqrt(real * real + imag * imag);
    }
  }

  // Normalize
  const maxEnergy = Math.max(...energy);
  if (maxEnergy > 0) {
    for (let i = 0; i < energy.length; i++) {
      energy[i] /= maxEnergy;
    }
  }

  return energy;
}

/**
 * AudioComparator compares two audio samples for similarity
 */
export class AudioComparator {
  /**
   * Compare two audio buffers
   */
  compare(
    audioA: ArrayBuffer,
    audioB: ArrayBuffer,
    options: ComparisonOptions = {}
  ): ComparisonResult {
    const {
      similarityThreshold = 0.8,
      allowDurationVariance = 0.1,
      useSpectralAnalysis = false,
      sampleRate = 16000,
    } = options;

    // Extract samples
    const samplesA = extractSamples(audioA);
    const samplesB = extractSamples(audioB);

    // Calculate durations
    const durationA = (samplesA.length / sampleRate) * 1000;
    const durationB = (samplesB.length / sampleRate) * 1000;
    const durationDifferenceMs = Math.abs(durationA - durationB);
    const durationVariance = durationDifferenceMs / Math.max(durationA, durationB);

    // Calculate RMSE
    const rmseDifference = calculateRMSE(samplesA, samplesB);

    // Calculate correlation
    const correlationCoefficient = calculateCorrelation(samplesA, samplesB);

    // Calculate spectral similarity if requested
    let spectralSimilarity: number | undefined;
    if (useSpectralAnalysis) {
      const spectrumA = calculateSpectralEnergy(samplesA);
      const spectrumB = calculateSpectralEnergy(samplesB);
      spectralSimilarity = calculateCorrelation(spectrumA, spectrumB);
    }

    // Calculate overall similarity score
    // Weight different metrics
    let similarity = 0;
    let weights = 0;

    // Correlation is the primary metric
    similarity += Math.max(0, correlationCoefficient) * 0.5;
    weights += 0.5;

    // RMSE contribution (inverted - lower is better)
    const rmseScore = Math.max(0, 1 - rmseDifference * 2);
    similarity += rmseScore * 0.3;
    weights += 0.3;

    // Duration matching
    const durationScore = 1 - Math.min(1, durationVariance / allowDurationVariance);
    similarity += durationScore * 0.2;
    weights += 0.2;

    similarity /= weights;

    // Include spectral similarity if available
    if (spectralSimilarity !== undefined) {
      similarity = similarity * 0.7 + Math.max(0, spectralSimilarity) * 0.3;
    }

    const pass = similarity >= similarityThreshold && durationVariance <= allowDurationVariance;

    return {
      similarity,
      pass,
      metrics: {
        rmseDifference,
        correlationCoefficient,
        durationDifferenceMs,
        spectralSimilarity,
      },
      details: this.generateDetails(similarity, pass, {
        rmseDifference,
        correlationCoefficient,
        durationDifferenceMs,
        durationVariance,
        spectralSimilarity,
        similarityThreshold,
        allowDurationVariance,
      }),
    };
  }

  /**
   * Generate human-readable comparison details
   */
  private generateDetails(
    similarity: number,
    pass: boolean,
    metrics: {
      rmseDifference: number;
      correlationCoefficient: number;
      durationDifferenceMs: number;
      durationVariance: number;
      spectralSimilarity?: number;
      similarityThreshold: number;
      allowDurationVariance: number;
    }
  ): string {
    const lines: string[] = [];

    lines.push(`Similarity Score: ${(similarity * 100).toFixed(1)}%`);
    lines.push(`Status: ${pass ? 'PASS' : 'FAIL'}`);
    lines.push('');
    lines.push('Metrics:');
    lines.push(`  RMSE: ${metrics.rmseDifference.toFixed(4)}`);
    lines.push(`  Correlation: ${metrics.correlationCoefficient.toFixed(4)}`);
    lines.push(`  Duration Difference: ${metrics.durationDifferenceMs.toFixed(1)}ms (${(metrics.durationVariance * 100).toFixed(1)}%)`);

    if (metrics.spectralSimilarity !== undefined) {
      lines.push(`  Spectral Similarity: ${(metrics.spectralSimilarity * 100).toFixed(1)}%`);
    }

    lines.push('');
    lines.push('Thresholds:');
    lines.push(`  Similarity: ${(metrics.similarityThreshold * 100).toFixed(0)}%`);
    lines.push(`  Duration Variance: ${(metrics.allowDurationVariance * 100).toFixed(0)}%`);

    return lines.join('\n');
  }

  /**
   * Compare multiple audio pairs and return aggregate results
   */
  compareMultiple(
    pairs: Array<{ audioA: ArrayBuffer; audioB: ArrayBuffer; label?: string }>,
    options: ComparisonOptions = {}
  ): {
    results: Array<ComparisonResult & { label?: string }>;
    summary: {
      totalPairs: number;
      passed: number;
      averageSimilarity: number;
    };
  } {
    const results = pairs.map(pair => ({
      ...this.compare(pair.audioA, pair.audioB, options),
      label: pair.label,
    }));

    const passed = results.filter(r => r.pass).length;
    const avgSimilarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;

    return {
      results,
      summary: {
        totalPairs: pairs.length,
        passed,
        averageSimilarity: avgSimilarity,
      },
    };
  }
}

export default AudioComparator;
