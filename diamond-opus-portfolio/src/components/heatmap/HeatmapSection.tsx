import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import CodeBlock from '../shared/CodeBlock';
import { easing, heatmapConstants } from '../../utils/constants';

// Simulated density data: price-per-carat ranges and diamond counts
const densityData = [
  { range: '$0-50', count: 12400, zone: 'dense' },
  { range: '$50-100', count: 18200, zone: 'dense' },
  { range: '$100-200', count: 24800, zone: 'dense' },
  { range: '$200-500', count: 31500, zone: 'dense' },
  { range: '$500-1K', count: 28900, zone: 'dense' },
  { range: '$1K-2K', count: 22100, zone: 'dense' },
  { range: '$2K-3K', count: 15600, zone: 'dense' },
  { range: '$3K-5K', count: 9800, zone: 'dense' },
  { range: '$5K-8K', count: 4200, zone: 'sparse' },
  { range: '$8K-12K', count: 2100, zone: 'sparse' },
  { range: '$12K-20K', count: 980, zone: 'sparse' },
  { range: '$20K-50K', count: 340, zone: 'sparse' },
];

const maxCount = Math.max(...densityData.map((d) => d.count));

const partitionColors = [
  '#B8860B', '#D4A94C', '#9A7209', '#B8860B', '#D4A94C',
  '#9A7209', '#B8860B', '#D4A94C', '#9A7209', '#B8860B',
];

const codeSnippet = `// Adaptive Density Scanning
HEATMAP_DENSE_ZONE_THRESHOLD = $${heatmapConstants.HEATMAP_DENSE_ZONE_THRESHOLD.toLocaleString()}/ct
HEATMAP_DENSE_ZONE_STEP      = $${heatmapConstants.HEATMAP_DENSE_ZONE_STEP}/ct
HEATMAP_INITIAL_STEP          = $${heatmapConstants.HEATMAP_INITIAL_STEP}/ct
HEATMAP_MAX_WORKERS           = ${heatmapConstants.HEATMAP_MAX_WORKERS}
HEATMAP_MAX_PRICE             = $${heatmapConstants.HEATMAP_MAX_PRICE.toLocaleString()}/ct`;

export default function HeatmapSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="heatmap">
      <div ref={ref}>
        <SectionTitle
          title="Intelligent Partitioning"
          subtitle="Adaptive density scanning solves load balancing with no prior knowledge"
        />

        <div className="mt-12 grid gap-12 lg:grid-cols-5">
          {/* Chart */}
          <div className="lg:col-span-3">
            {/* Dense/Sparse zone labels */}
            <div className="mb-4 flex items-center gap-4 text-xs font-sans uppercase tracking-[0.08em] text-warm-gray-400">
              <div className="flex items-center gap-2">
                <div className="h-2 w-6 rounded-full bg-gold" />
                Dense Zone ($0–$5K/ct)
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-6 rounded-full bg-warm-gray-400" />
                Sparse Zone ($5K+)
              </div>
            </div>

            {/* Bar chart */}
            <div className="flex items-end gap-1.5" style={{ height: 240 }}>
              {densityData.map((bar, i) => {
                const heightPct = (bar.count / maxCount) * 100;
                const partitionIdx = Math.min(i, partitionColors.length - 1);

                return (
                  <div key={bar.range} className="group relative flex flex-1 flex-col items-center">
                    <motion.div
                      className="w-full rounded-t"
                      style={{
                        backgroundColor:
                          bar.zone === 'dense'
                            ? partitionColors[partitionIdx]
                            : '#9A9590',
                        opacity: bar.zone === 'dense' ? 0.8 : 0.5,
                      }}
                      initial={{ height: 0 }}
                      animate={inView ? { height: `${heightPct}%` } : {}}
                      transition={{
                        duration: 0.8,
                        delay: 0.3 + i * 0.08,
                        ease: easing.luxury,
                      }}
                    />
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute -top-10 z-10 hidden whitespace-nowrap rounded bg-charcoal px-2 py-1 text-xs text-cream group-hover:block">
                      {bar.count.toLocaleString()} diamonds
                    </div>
                    {/* Label */}
                    <span className="mt-2 text-[10px] text-warm-gray-400 md:text-xs">
                      {bar.range}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Threshold marker */}
            <div className="mt-4 flex items-center gap-2">
              <div className="h-px flex-1 border-t border-dashed border-gold" />
              <span className="font-mono text-xs text-gold">
                $5,000/ct threshold
              </span>
              <div className="h-px flex-1 border-t border-dashed border-gold" />
            </div>
          </div>

          {/* Code constants */}
          <div className="lg:col-span-2">
            <CodeBlock code={codeSnippet} />

            <motion.div
              className="mt-6 space-y-3"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 1.2, duration: 0.8 }}
            >
              <p className="font-sans text-sm leading-relaxed text-warm-gray-500">
                <span className="font-500 text-charcoal">Dense zone:</span> Fixed $50/ct steps ensure
                fine-grained partitions where most diamonds cluster.
              </p>
              <p className="font-sans text-sm leading-relaxed text-warm-gray-500">
                <span className="font-500 text-charcoal">Sparse zone:</span> Adaptive stepping uses
                binary search refinement to avoid empty partitions.
              </p>
              <p className="font-sans text-sm leading-relaxed text-warm-gray-500">
                <span className="font-500 text-charcoal">Result:</span> Balanced work distribution
                across {heatmapConstants.HEATMAP_MAX_WORKERS} workers without prior knowledge of data
                distribution.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
