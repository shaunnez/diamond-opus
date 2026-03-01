import { motion } from 'framer-motion';

export default function DiamondFallback() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Glow */}
      <motion.div
        className="absolute h-48 w-48 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(184,134,11,0.15) 0%, transparent 70%)',
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Diamond SVG */}
      <motion.svg
        viewBox="0 0 200 240"
        className="h-48 w-40"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      >
        {/* Crown */}
        <polygon
          points="100,10 170,80 30,80"
          fill="none"
          stroke="#B8860B"
          strokeWidth="1.5"
          opacity="0.8"
        />
        {/* Table */}
        <line x1="60" y1="55" x2="140" y2="55" stroke="#B8860B" strokeWidth="0.75" opacity="0.5" />
        {/* Crown facets */}
        <line x1="100" y1="10" x2="80" y2="80" stroke="#B8860B" strokeWidth="0.75" opacity="0.4" />
        <line x1="100" y1="10" x2="120" y2="80" stroke="#B8860B" strokeWidth="0.75" opacity="0.4" />
        {/* Girdle */}
        <line x1="30" y1="80" x2="170" y2="80" stroke="#B8860B" strokeWidth="1" />
        {/* Pavilion */}
        <polygon
          points="30,80 170,80 100,230"
          fill="none"
          stroke="#B8860B"
          strokeWidth="1.5"
          opacity="0.8"
        />
        {/* Pavilion facets */}
        <line x1="70" y1="80" x2="100" y2="230" stroke="#B8860B" strokeWidth="0.5" opacity="0.3" />
        <line x1="130" y1="80" x2="100" y2="230" stroke="#B8860B" strokeWidth="0.5" opacity="0.3" />
        {/* Shimmer facet fills */}
        <motion.polygon
          points="100,10 80,80 60,55"
          fill="#B8860B"
          initial={{ opacity: 0.05 }}
          animate={{ opacity: [0.05, 0.15, 0.05] }}
          transition={{ duration: 3, repeat: Infinity, delay: 0 }}
        />
        <motion.polygon
          points="100,10 120,80 140,55"
          fill="#D4A94C"
          initial={{ opacity: 0.05 }}
          animate={{ opacity: [0.05, 0.12, 0.05] }}
          transition={{ duration: 3, repeat: Infinity, delay: 1 }}
        />
        <motion.polygon
          points="70,80 100,230 30,80"
          fill="#B8860B"
          initial={{ opacity: 0.03 }}
          animate={{ opacity: [0.03, 0.1, 0.03] }}
          transition={{ duration: 4, repeat: Infinity, delay: 0.5 }}
        />
      </motion.svg>
    </div>
  );
}
