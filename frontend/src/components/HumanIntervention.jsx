import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export default function HumanIntervention({ intervention, onDecision }) {
  if (!intervention) return null;

  try {
    const { errors, extractedData, interventionId, message } = intervention || {};
    
    // Safety check - ensure we have required data
    if (!interventionId) {
      console.error('HumanIntervention: Missing interventionId', intervention);
      return null;
    }

    if (!onDecision || typeof onDecision !== 'function') {
      console.error('HumanIntervention: Missing or invalid onDecision callback');
      return null;
    }

    const handleAccept = () => {
      try {
        onDecision(interventionId, 'accept');
      } catch (error) {
        console.error('Error in handleAccept:', error);
      }
    };

    const handleDecline = () => {
      try {
        onDecision(interventionId, 'decline');
      } catch (error) {
        console.error('Error in handleDecline:', error);
      }
    };

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => e.stopPropagation()}
        >
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          className="relative max-w-2xl w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border-2 border-red-500/50 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600/30 via-orange-600/30 to-red-600/30 p-6 border-b border-red-500/30">
            <div className="flex items-center gap-4">
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ 
                  duration: 2, 
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              >
                <AlertTriangle className="w-10 h-10 text-red-400" />
              </motion.div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-1">
                  Human Intervention Required
                </h2>
                <p className="text-red-300 text-sm">
                  {message || 'Quality Agent detected calculation errors'}
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Errors List */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                <span>Calculation Errors Detected</span>
              </h3>
              <div className="space-y-2">
                {errors && Array.isArray(errors) && errors.length > 0 ? (
                  errors.map((error, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                    >
                      <p className="text-red-200 text-sm">{String(error || 'Unknown error')}</p>
                    </motion.div>
                  ))
                ) : (
                  <p className="text-white/60 text-sm">No specific errors listed</p>
                )}
              </div>
            </div>

            {/* Extracted Data Summary */}
            {extractedData && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-blue-400" />
                  <span>Extracted Invoice Data</span>
                </h3>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-white/60">Vendor:</span>
                      <p className="text-white font-medium">{String(extractedData?.vendor || 'N/A')}</p>
                    </div>
                    <div>
                      <span className="text-white/60">Invoice #:</span>
                      <p className="text-white font-medium">{String(extractedData?.invoiceNumber || 'N/A')}</p>
                    </div>
                    <div>
                      <span className="text-white/60">Date:</span>
                      <p className="text-white font-medium">{String(extractedData?.date || 'N/A')}</p>
                    </div>
                    <div>
                      <span className="text-white/60">Subtotal:</span>
                      <p className="text-white font-medium">${(() => {
                        const val = extractedData?.subtotal;
                        if (typeof val === 'number') return val.toFixed(2);
                        if (typeof val === 'string') return val;
                        return '0.00';
                      })()}</p>
                    </div>
                    <div>
                      <span className="text-white/60">Tax:</span>
                      <p className="text-white font-medium">${(() => {
                        const val = extractedData?.tax;
                        if (typeof val === 'number') return val.toFixed(2);
                        if (typeof val === 'string') return val;
                        return '0.00';
                      })()}</p>
                    </div>
                    <div>
                      <span className="text-white/60">Total:</span>
                      <p className="text-white font-medium text-lg">${(() => {
                        const val = extractedData?.total;
                        if (typeof val === 'number') return val.toFixed(2);
                        if (typeof val === 'string') return val;
                        return '0.00';
                      })()}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4">
              <motion.button
                onClick={handleAccept}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Accept & Continue
              </motion.button>
              <motion.button
                onClick={handleDecline}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                Decline & Stop
              </motion.button>
            </div>

            <p className="text-center text-white/50 text-xs">
              Review the errors above and decide whether to proceed with the workflow
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    );
  } catch (error) {
    console.error('Error rendering HumanIntervention:', error);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-red-900/90 text-white p-6 rounded-lg max-w-md">
          <h2 className="text-xl font-bold mb-2">Error Displaying Intervention</h2>
          <p className="text-sm">{error.message}</p>
        </div>
      </div>
    );
  }
}

