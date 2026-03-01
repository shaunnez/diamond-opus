import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import CodeBlock from '../shared/CodeBlock';
import { easing, heatmapConstants } from '../../utils/constants';

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
  { range: '$12-20K', count: 980, zone: 'sparse' },
  { range: '$20-50K', count: 340, zone: 'sparse' },
];

const maxCount = Math.max(...densityData.map((d) => d.count));

const partitionColors = [
  '#B8860B', '#D4A94C', '#9A7209', '#B8860B', '#D4A94C',
  '#9A7209', '#B8860B', '#D4A94C', '#9A7209', '#B8860B',
];

const codeSnippet = `// Adaptive Density Scanning
DENSE_THRESHOLD = $${heatmapConstants.HEATMAP_DENSE_ZONE_THRESHOLD.toLocaleString()}/ct
DENSE_STEP      = $${heatmapConstants.HEATMAP_DENSE_ZONE_STEP}/ct
INITIAL_STEP    = $${heatmapConstants.HEATMAP_INITIAL_STEP}/ct
MAX_WORKERS     = ${heatmapConstants.HEATMAP_MAX_WORKERS}
MAX_PRICE       = $${heatmapConstants.HEATMAP_MAX_PRICE.toLocaleString()}/ct`;

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

        <div className="mt-8 grid gap-8 sm:mt-12 sm:gap-12 lg:grid-cols-5">
          {/* Chart */}
          <div className="lg:col-span-3">
            {/* Zone labels */}
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[10px] font-sans uppercase tracking-[0.06em] text-warm-gray-400 sm:mb-4 sm:gap-4 sm:text-xs sm:tracking-[0.08em]">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-4 rounded-full bg-gold sm:h-2 sm:w-6" />
                Dense ($0–$5K/ct)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-4 rounded-full bg-warm-gray-400 sm:h-2 sm:w-6" />
                Sparse ($5K+)
              </div>
            </div>

            {/* Bar chart */}
            <div className="flex items-end gap-0.5 sm:gap-1.5" style={{ height: 160 }}>
              {densityData.map((bar, i) => {
                const heightPct = (bar.count / maxCount) * 100;
                const partitionIdx = Math.min(i, partitionColors.length - 1);

                return (
                  <div key={bar.range} className="group relative flex flex-1 flex-col items-center">
                    <motion.div
                      className="w-full rounded-t"
                      style={{
                        backgroundColor:
                          bar.zone === 'dense' ? partitionColors[partitionIdx] : '#9A9590',
                        opacity: bar.zone === 'dense' ? 0.8 : 0.5,
                      }}
                      initial={{ height: 0 }}
                      animate={inView ? { height: `${heightPct}%` } : {}}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.08, ease: easing.luxury }}
                    />
                    {/* Tooltip (desktop only) */}
                    <div className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded bg-charcoal px-2 py-0.5 text-[10px] text-cream group-hover:block">
                      {bar.count.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Labels - hide on very small screens, show on sm+ */}
            <div className="mt-1 hidden gap-0.5 sm:flex sm:gap-1.5">
              {densityData.map((bar) => (
                <div key={bar.range} className="flex-1 text-center">
                  <span className="text-[9px] text-warm-gray-400 md:text-[10px]">{bar.range}</span>
                </div>
              ))}
            </div>

            {/* Threshold */}
            <div className="mt-3 flex items-center gap-2 sm:mt-4">
              <div className="h-px flex-1 border-t border-dashed border-gold" />
              <span className="whitespace-nowrap font-mono text-[10px] text-gold sm:text-xs">$5,000/ct</span>
              <div className="h-px flex-1 border-t border-dashed border-gold" />
            </div>
          </div>

          {/* Code constants */}
          <div className="lg:col-span-2">
            <CodeBlock code={codeSnippet} />

            <motion.div
              className="mt-4 space-y-2 sm:mt-6 sm:space-y-3"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 1.2, duration: 0.8 }}
            >
              <p className="font-sans text-xs leading-relaxed text-warm-gray-500 sm:text-sm">
                <span className="font-500 text-charcoal">Dense zone:</span> Fixed $50/ct steps where most diamonds cluster.
              </p>
              <p className="font-sans text-xs leading-relaxed text-warm-gray-500 sm:text-sm">
                <span className="font-500 text-charcoal">Sparse zone:</span> Adaptive stepping via binary search.
              </p>
              <p className="font-sans text-xs leading-relaxed text-warm-gray-500 sm:text-sm">
                <span className="font-500 text-charcoal">Result:</span> Balanced distribution across {heatmapConstants.HEATMAP_MAX_WORKERS} workers.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
