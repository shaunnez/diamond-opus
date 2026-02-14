import { ExternalLink } from 'lucide-react';
import type { Diamond } from '../../types/diamond';
import { formatNumber } from '../../utils/format';

interface DiamondSpecsProps {
  diamond: Diamond;
}

function SpecRow({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-2 border-b border-border/50">
      <span className="text-xs text-warm-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-charcoal font-medium">{value}</span>
    </div>
  );
}

export function DiamondSpecs({ diamond }: DiamondSpecsProps) {
  const m = diamond.measurements;

  return (
    <div className="space-y-6">
      {/* Core Specs */}
      <div>
        <h3 className="font-serif text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">
          Specifications
        </h3>
        <div className="space-y-0">
          <SpecRow label="Shape" value={diamond.shape} />
          <SpecRow label="Carats" value={diamond.carats?.toFixed(2)} />
          <SpecRow label="Color" value={diamond.color} />
          <SpecRow label="Clarity" value={diamond.clarity} />
          <SpecRow label="Cut" value={diamond.cut} />
          <SpecRow label="Polish" value={diamond.polish} />
          <SpecRow label="Symmetry" value={diamond.symmetry} />
          <SpecRow label="Fluorescence" value={diamond.fluorescence || diamond.fluorescenceIntensity} />
          <SpecRow label="Lab Grown" value={diamond.labGrown ? 'Yes' : 'No'} />
          {diamond.treated && <SpecRow label="Treated" value="Yes" />}
          <SpecRow label="L/W Ratio" value={diamond.ratio ? formatNumber(diamond.ratio) : undefined} />
        </div>
      </div>

      {/* Fancy Color */}
      {diamond.fancyColor && (
        <div>
          <h3 className="font-serif text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">
            Fancy Color
          </h3>
          <SpecRow label="Color" value={diamond.fancyColor} />
          <SpecRow label="Intensity" value={diamond.fancyIntensity} />
          <SpecRow label="Overtone" value={diamond.fancyOvertone} />
        </div>
      )}

      {/* Measurements */}
      {m && (
        <div>
          <h3 className="font-serif text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">
            Measurements
          </h3>
          {m.length != null && m.width != null && (
            <SpecRow
              label="Dimensions"
              value={`${formatNumber(m.length)} x ${formatNumber(m.width)}${m.depth != null ? ` x ${formatNumber(m.depth)}` : ''} mm`}
            />
          )}
          <SpecRow label="Table" value={m.table != null ? `${formatNumber(m.table, 1)}%` : undefined} />
          <SpecRow label="Depth" value={m.depthPercentage != null ? `${formatNumber(m.depthPercentage, 1)}%` : undefined} />
          <SpecRow label="Crown Angle" value={m.crownAngle != null ? `${formatNumber(m.crownAngle, 1)}\u00B0` : undefined} />
          <SpecRow label="Pavilion Angle" value={m.pavAngle != null ? `${formatNumber(m.pavAngle, 1)}\u00B0` : undefined} />
          <SpecRow label="Girdle" value={m.girdle} />
          <SpecRow label="Culet" value={m.culetSize} />
        </div>
      )}

      {/* Certificate */}
      {diamond.certificateLab && (
        <div>
          <h3 className="font-serif text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">
            Certificate
          </h3>
          <SpecRow label="Lab" value={diamond.certificateLab} />
          <SpecRow label="Number" value={diamond.certificateNumber} />
          {diamond.certificatePdfUrl && (
            <div className="pt-2">
              <a
                href={diamond.certificatePdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-gold hover:text-gold-hover font-medium uppercase tracking-wider transition-colors"
              >
                View Certificate
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Additional Attributes */}
      {diamond.attributes && (
        <div>
          <h3 className="font-serif text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">
            Attributes
          </h3>
          <SpecRow label="Eye Clean" value={diamond.attributes.eyeClean ? 'Yes' : diamond.attributes.eyeClean === false ? 'No' : undefined} />
          <SpecRow label="Country of Origin" value={diamond.attributes.countryOfOrigin} />
          <SpecRow label="Mine of Origin" value={diamond.attributes.mineOfOrigin} />
          <SpecRow label="Color Shade" value={diamond.attributes.colorShade} />
          {diamond.attributes.brown && <SpecRow label="Brown" value="Yes" />}
          {diamond.attributes.green && <SpecRow label="Green" value="Yes" />}
          {diamond.attributes.milky && <SpecRow label="Milky" value="Yes" />}
          <SpecRow label="Comments" value={diamond.attributes.comments} />
        </div>
      )}

      {/* Supplier */}
      {diamond.supplierName && (
        <div>
          <h3 className="font-serif text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">
            Supplier
          </h3>
          <SpecRow label="Name" value={diamond.supplierName} />
        </div>
      )}
    </div>
  );
}
