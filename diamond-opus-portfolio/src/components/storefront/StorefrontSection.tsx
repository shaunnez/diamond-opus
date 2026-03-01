import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import { easing } from '../../utils/constants';

const shapes = [
  { name: 'Round', path: 'M24,4 A20,20 0 1,1 24,44 A20,20 0 1,1 24,4Z' },
  { name: 'Princess', path: 'M4,4 L44,4 L44,44 L4,44Z' },
  { name: 'Emerald', path: 'M12,4 L36,4 L44,12 L44,36 L36,44 L12,44 L4,36 L4,12Z' },
  { name: 'Oval', path: 'M24,4 C38,4 44,14 44,24 C44,34 38,44 24,44 C10,44 4,34 4,24 C4,14 10,4 24,4Z' },
  { name: 'Marquise', path: 'M24,2 C36,10 44,20 44,24 C44,28 36,38 24,46 C12,38 4,28 4,24 C4,20 12,10 24,2Z' },
  { name: 'Pear', path: 'M24,4 C36,4 44,16 44,28 C44,38 36,46 24,46 C12,46 4,38 4,28 C4,16 12,4 24,4Z' },
  { name: 'Cushion', path: 'M8,4 L40,4 Q44,4 44,8 L44,40 Q44,44 40,44 L8,44 Q4,44 4,40 L4,8 Q4,4 8,4Z' },
  { name: 'Heart', path: 'M24,44 L4,22 A12,12 0 0,1 24,10 A12,12 0 0,1 44,22Z' },
];

const features = [
  { label: 'Infinite Scroll', desc: 'Cursor-based pagination' },
  { label: '14 Shapes', desc: 'Full diamond shape library' },
  { label: 'Video Media', desc: 'Supplier video integration' },
  { label: 'Stripe Checkout', desc: 'Secure payment flow' },
];

const sampleDiamonds = [
  { shape: 'Round', carat: '1.52', color: 'D', clarity: 'VVS1', price: '$12,450' },
  { shape: 'Emerald', carat: '2.01', color: 'E', clarity: 'VS1', price: '$18,900' },
  { shape: 'Oval', carat: '1.33', color: 'F', clarity: 'VVS2', price: '$9,200' },
  { shape: 'Princess', carat: '1.75', color: 'D', clarity: 'IF', price: '$22,800' },
  { shape: 'Cushion', carat: '2.50', color: 'G', clarity: 'VS2', price: '$14,600' },
  { shape: 'Pear', carat: '1.91', color: 'E', clarity: 'VVS1', price: '$16,350' },
];

export default function StorefrontSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="storefront">
      <div ref={ref}>
        <SectionTitle title="The Experience" subtitle="Customer-facing storefront built on the same API" />

        {/* Diamond shapes */}
        <motion.div
          className="mt-4 flex flex-wrap justify-center gap-4 sm:mt-8 sm:gap-6"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          {shapes.map((shape, i) => (
            <motion.div
              key={shape.name}
              className="flex flex-col items-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.4 + i * 0.08, duration: 0.5 }}
            >
              <svg viewBox="0 0 48 48" className="h-6 w-6 text-gold sm:h-8 sm:w-8">
                <path d={shape.path} fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="mt-0.5 font-sans text-[8px] text-warm-gray-400 sm:mt-1 sm:text-[10px]">{shape.name}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Storefront mockup */}
        <motion.div
          className="mt-8 overflow-hidden rounded-xl border border-border bg-cream sm:mt-12"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, duration: 1, ease: easing.luxury }}
        >
          {/* Browser chrome */}
          <div className="flex items-center gap-1.5 border-b border-border bg-pearl px-3 py-2 sm:gap-2 sm:px-4 sm:py-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-ruby/40 sm:h-2 sm:w-2" />
            <div className="h-1.5 w-1.5 rounded-full bg-amber/40 sm:h-2 sm:w-2" />
            <div className="h-1.5 w-1.5 rounded-full bg-emerald/40 sm:h-2 sm:w-2" />
            <div className="ml-2 flex-1 rounded-md bg-cream px-2 py-0.5 font-mono text-[10px] text-warm-gray-400 sm:ml-4 sm:px-3 sm:py-1 sm:text-xs">
              diamonds.example.com
            </div>
          </div>

          <div className="p-3 sm:p-6">
            {/* Diamond grid mockup */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3">
              {sampleDiamonds.map((diamond, i) => (
                <motion.div
                  key={i}
                  className="rounded-lg border border-border bg-white p-2.5 transition-shadow hover:shadow-lg sm:p-4"
                  initial={{ opacity: 0, y: 15 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.8 + i * 0.1, duration: 0.5 }}
                >
                  {/* Diamond shape icon */}
                  <div className="mb-2 flex justify-center sm:mb-3">
                    <svg viewBox="0 0 48 48" className="h-7 w-7 text-warm-gray-400 sm:h-10 sm:w-10">
                      <path
                        d={shapes.find((s) => s.name === diamond.shape)?.path || shapes[0].path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                    </svg>
                  </div>

                  <div className="text-center">
                    <p className="font-serif text-xs font-600 text-charcoal sm:text-sm">
                      {diamond.carat}ct {diamond.shape}
                    </p>
                    <p className="mt-0.5 font-sans text-[10px] text-warm-gray-400 sm:text-xs">
                      {diamond.color} / {diamond.clarity}
                    </p>
                    <p className="mt-1 font-serif text-sm font-600 text-gold sm:mt-2 sm:text-base">
                      {diamond.price}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:mt-12 sm:gap-6 md:grid-cols-4">
          {features.map((feat, i) => (
            <motion.div
              key={feat.label}
              className="text-center"
              initial={{ opacity: 0, y: 15 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 1.4 + i * 0.1, duration: 0.5 }}
            >
              <p className="font-sans text-xs font-500 text-charcoal sm:text-sm">{feat.label}</p>
              <p className="mt-0.5 font-sans text-[10px] text-warm-gray-400 sm:mt-1 sm:text-xs">{feat.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
