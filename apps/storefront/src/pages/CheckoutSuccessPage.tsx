import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get('order');

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
      <h1 className="font-serif text-3xl text-charcoal mb-2">Payment Successful</h1>
      {orderNumber && (
        <p className="text-lg text-warm-gray-600 mb-2">
          Order <span className="font-mono font-semibold">{orderNumber}</span>
        </p>
      )}
      <p className="text-warm-gray-500 mb-8">
        Your diamond order is being processed. You will be contacted shortly with confirmation details.
      </p>
      <Link
        to="/"
        className="inline-block px-6 py-3 bg-charcoal text-white font-medium hover:bg-charcoal/90 transition-colors"
      >
        Continue Shopping
      </Link>
    </div>
  );
}
