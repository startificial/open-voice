/**
 * Latency Measurer
 *
 * Precise timing instrumentation for measuring voice pipeline latency.
 * Tracks time-to-first-byte, total processing time, and component-level metrics.
 */

export interface LatencyMetrics {
  timeToFirstByteMs: number;
  totalProcessingMs: number;
  audioInputDurationMs: number;
  audioOutputDurationMs: number;
  processingRatio: number; // processing time / audio duration
  componentMetrics?: ComponentMetrics;
}

export interface ComponentMetrics {
  sttLatencyMs?: number;
  llmLatencyMs?: number;
  ttsLatencyMs?: number;
  s2sLatencyMs?: number;
}

export interface LatencyMark {
  name: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface LatencyReport {
  totalSamples: number;
  metrics: {
    timeToFirstByte: StatsSummary;
    totalProcessing: StatsSummary;
    processingRatio: StatsSummary;
  };
  componentMetrics?: {
    stt?: StatsSummary;
    llm?: StatsSummary;
    tts?: StatsSummary;
    s2s?: StatsSummary;
  };
}

export interface StatsSummary {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stdDev: number;
}

/**
 * Calculate statistical summary from array of values
 */
function calculateStats(values: number[]): StatsSummary {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, stdDev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;

  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    stdDev,
  };
}

/**
 * LatencyMeasurer provides precise timing instrumentation
 */
export class LatencyMeasurer {
  private marks: Map<string, LatencyMark[]> = new Map();
  private samples: LatencyMetrics[] = [];
  private currentMeasurement: {
    marks: LatencyMark[];
    startTime: number;
    firstByteTime?: number;
    endTime?: number;
    audioInputDuration?: number;
    audioOutputDuration?: number;
  } | null = null;

  /**
   * Start a new latency measurement
   */
  startMeasurement(audioInputDurationMs?: number): void {
    this.currentMeasurement = {
      marks: [],
      startTime: performance.now(),
      audioInputDuration: audioInputDurationMs,
    };
    this.mark('start');
  }

  /**
   * Record a timing mark
   */
  mark(name: string, metadata?: Record<string, any>): void {
    if (!this.currentMeasurement) {
      console.warn('No active measurement. Call startMeasurement() first.');
      return;
    }

    const mark: LatencyMark = {
      name,
      timestamp: performance.now(),
      metadata,
    };

    this.currentMeasurement.marks.push(mark);

    // Track first byte
    if (name === 'first_byte' || name === 'first_audio_chunk') {
      this.currentMeasurement.firstByteTime = mark.timestamp;
    }
  }

  /**
   * Mark component start
   */
  markComponentStart(component: 'stt' | 'llm' | 'tts' | 's2s'): void {
    this.mark(`${component}_start`);
  }

  /**
   * Mark component end
   */
  markComponentEnd(component: 'stt' | 'llm' | 'tts' | 's2s'): void {
    this.mark(`${component}_end`);
  }

  /**
   * End the current measurement and record metrics
   */
  endMeasurement(audioOutputDurationMs?: number): LatencyMetrics | null {
    if (!this.currentMeasurement) {
      console.warn('No active measurement.');
      return null;
    }

    const endTime = performance.now();
    this.currentMeasurement.endTime = endTime;
    this.currentMeasurement.audioOutputDuration = audioOutputDurationMs;
    this.mark('end');

    const metrics = this.calculateMetrics();
    if (metrics) {
      this.samples.push(metrics);
    }

    this.currentMeasurement = null;
    return metrics;
  }

  /**
   * Calculate metrics from current measurement
   */
  private calculateMetrics(): LatencyMetrics | null {
    if (!this.currentMeasurement) return null;

    const { marks, startTime, firstByteTime, endTime, audioInputDuration, audioOutputDuration } = this.currentMeasurement;

    const totalProcessingMs = (endTime || performance.now()) - startTime;
    const timeToFirstByteMs = firstByteTime ? firstByteTime - startTime : totalProcessingMs;

    // Calculate component metrics
    const componentMetrics: ComponentMetrics = {};
    const components: Array<'stt' | 'llm' | 'tts' | 's2s'> = ['stt', 'llm', 'tts', 's2s'];

    for (const component of components) {
      const startMark = marks.find(m => m.name === `${component}_start`);
      const endMark = marks.find(m => m.name === `${component}_end`);
      if (startMark && endMark) {
        componentMetrics[`${component}LatencyMs` as keyof ComponentMetrics] =
          endMark.timestamp - startMark.timestamp;
      }
    }

    return {
      timeToFirstByteMs,
      totalProcessingMs,
      audioInputDurationMs: audioInputDuration || 0,
      audioOutputDurationMs: audioOutputDuration || 0,
      processingRatio: audioInputDuration ? totalProcessingMs / audioInputDuration : 0,
      componentMetrics: Object.keys(componentMetrics).length > 0 ? componentMetrics : undefined,
    };
  }

  /**
   * Get aggregated report of all measurements
   */
  getReport(): LatencyReport {
    const timeToFirstByteValues = this.samples.map(s => s.timeToFirstByteMs);
    const totalProcessingValues = this.samples.map(s => s.totalProcessingMs);
    const processingRatioValues = this.samples.map(s => s.processingRatio);

    const report: LatencyReport = {
      totalSamples: this.samples.length,
      metrics: {
        timeToFirstByte: calculateStats(timeToFirstByteValues),
        totalProcessing: calculateStats(totalProcessingValues),
        processingRatio: calculateStats(processingRatioValues),
      },
    };

    // Aggregate component metrics if available
    const components: Array<'stt' | 'llm' | 'tts' | 's2s'> = ['stt', 'llm', 'tts', 's2s'];
    const componentMetrics: LatencyReport['componentMetrics'] = {};

    for (const component of components) {
      const values = this.samples
        .map(s => s.componentMetrics?.[`${component}LatencyMs` as keyof ComponentMetrics])
        .filter((v): v is number => v !== undefined);

      if (values.length > 0) {
        componentMetrics[component] = calculateStats(values);
      }
    }

    if (Object.keys(componentMetrics).length > 0) {
      report.componentMetrics = componentMetrics;
    }

    return report;
  }

  /**
   * Format report as human-readable string
   */
  formatReport(report?: LatencyReport): string {
    const r = report || this.getReport();
    const lines: string[] = [];

    lines.push('=== Latency Report ===');
    lines.push(`Total Samples: ${r.totalSamples}`);
    lines.push('');

    lines.push('Time to First Byte (ms):');
    lines.push(this.formatStats(r.metrics.timeToFirstByte));
    lines.push('');

    lines.push('Total Processing (ms):');
    lines.push(this.formatStats(r.metrics.totalProcessing));
    lines.push('');

    lines.push('Processing Ratio (processing time / audio duration):');
    lines.push(this.formatStats(r.metrics.processingRatio, 2));

    if (r.componentMetrics) {
      lines.push('');
      lines.push('Component Latencies (ms):');
      for (const [component, stats] of Object.entries(r.componentMetrics)) {
        lines.push(`  ${component.toUpperCase()}: ${this.formatStats(stats)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format stats summary as string
   */
  private formatStats(stats: StatsSummary, decimals: number = 1): string {
    return `  min=${stats.min.toFixed(decimals)}, max=${stats.max.toFixed(decimals)}, ` +
      `mean=${stats.mean.toFixed(decimals)}, p95=${stats.p95.toFixed(decimals)}, ` +
      `p99=${stats.p99.toFixed(decimals)}`;
  }

  /**
   * Reset all measurements
   */
  reset(): void {
    this.marks.clear();
    this.samples = [];
    this.currentMeasurement = null;
  }

  /**
   * Get raw samples
   */
  getSamples(): LatencyMetrics[] {
    return [...this.samples];
  }

  /**
   * Create a measurement wrapper for async operations
   */
  async measure<T>(
    fn: () => Promise<T>,
    audioInputDurationMs?: number
  ): Promise<{ result: T; metrics: LatencyMetrics | null }> {
    this.startMeasurement(audioInputDurationMs);
    try {
      const result = await fn();
      const metrics = this.endMeasurement();
      return { result, metrics };
    } catch (error) {
      this.endMeasurement();
      throw error;
    }
  }
}

export default LatencyMeasurer;
