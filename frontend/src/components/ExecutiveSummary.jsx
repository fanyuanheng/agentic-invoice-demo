import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2, TrendingUp, Zap } from 'lucide-react';

export default function ExecutiveSummary({ agenticDecisions, isVisible }) {
  if (!isVisible) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mt-8 relative z-10"
        >
          <div 
            className="rounded-2xl border-2 border-emerald-500/30 shadow-2xl overflow-hidden"
            style={{ backgroundColor: '#0a0a0a' }}
          >
            {/* Header with gradient accent */}
            <div className="relative bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-emerald-500/20 p-6 border-b border-emerald-500/30">
              {/* Animated gradient overlay */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-emerald-400/10 via-blue-400/10 to-emerald-400/10"
                animate={{
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              />
              <div className="relative flex items-center gap-3">
                <motion.div
                  animate={{ 
                    rotate: [0, 360],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ 
                    duration: 3, 
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                >
                  <Sparkles className="w-8 h-8 text-emerald-300 drop-shadow-lg" style={{ filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.6))' }} />
                </motion.div>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">
                    Executive Summary
                  </h2>
                  <p className="text-emerald-300 text-sm" style={{ textShadow: '0 0 10px rgba(16, 185, 129, 0.5)' }}>
                    Agentic Decisions & Autonomous Actions
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="mb-6">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))' }} />
                  <span className="text-emerald-300" style={{ textShadow: '0 0 8px rgba(16, 185, 129, 0.5)' }}>Workflow Complete - 100%</span>
                </div>
                <p className="text-white/70 text-sm">
                  All agents have successfully completed their tasks. The invoice has been processed and appended to Google Sheets.
                </p>
              </div>

              {/* Agentic Decisions */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mb-4">
                  <Zap className="w-4 h-4 text-blue-400" style={{ filter: 'drop-shadow(0 0 6px rgba(96, 165, 250, 0.6))' }} />
                  <span className="text-blue-400" style={{ textShadow: '0 0 8px rgba(96, 165, 250, 0.5)' }}>Agentic Decisions</span>
                </div>
                
                {agenticDecisions && agenticDecisions.length > 0 ? (
                  <div className="space-y-3">
                    {agenticDecisions.map((decision, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.4 }}
                        className="relative rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 to-blue-500/5 p-4 backdrop-blur-sm"
                        style={{ boxShadow: '0 0 20px rgba(16, 185, 129, 0.1), inset 0 0 20px rgba(59, 130, 246, 0.05)' }}
                      >
                        {/* Decorative accent line with glow */}
                        <div 
                          className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-300 to-blue-400 rounded-l-lg"
                          style={{ boxShadow: '0 0 10px rgba(16, 185, 129, 0.6), 0 0 10px rgba(59, 130, 246, 0.4)' }}
                        />
                        
                        <div className="ml-4">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <TrendingUp className="w-4 h-4 text-emerald-300" style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))' }} />
                                <h3 className="text-emerald-300 font-semibold text-base" style={{ textShadow: '0 0 8px rgba(16, 185, 129, 0.4)' }}>
                                  {decision.decision}
                                </h3>
                              </div>
                              <p className="text-white/60 text-sm leading-relaxed">
                                {decision.details}
                              </p>
                              {decision.impact && (
                                <p className="text-blue-300 text-xs mt-2 italic" style={{ textShadow: '0 0 6px rgba(59, 130, 246, 0.4)' }}>
                                  Impact: {decision.impact}
                                </p>
                              )}
                            </div>
                            {decision.confidence !== undefined && (
                              <div className="flex-shrink-0">
                                <div 
                                  className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-300/40"
                                  style={{ boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)' }}
                                >
                                  <span className="text-emerald-300 text-xs font-semibold" style={{ textShadow: '0 0 6px rgba(16, 185, 129, 0.5)' }}>
                                    {decision.confidence}% confidence
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="mt-2">
                            <span className="text-xs text-white/40 font-mono">
                              Agent: {decision.agent}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="relative rounded-lg border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-blue-500/5 p-6 backdrop-blur-sm text-center"
                  >
                    <p className="text-white/50 text-sm italic">
                      No autonomous decisions were required for this workflow. All processing completed successfully with standard validation.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Summary Stats */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: agenticDecisions.length * 0.1 + 0.2 }}
                className="mt-6 pt-6 border-t border-emerald-500/20"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    className="text-center p-4 rounded-lg bg-emerald-500/10 border border-emerald-400/30"
                    style={{ boxShadow: '0 0 15px rgba(16, 185, 129, 0.2)' }}
                  >
                    <div className="text-2xl font-bold text-emerald-300 mb-1" style={{ textShadow: '0 0 10px rgba(16, 185, 129, 0.6)' }}>
                      {agenticDecisions?.length || 0}
                    </div>
                    <div className="text-xs text-emerald-300 uppercase tracking-wide">
                      Autonomous Decisions
                    </div>
                  </div>
                  <div 
                    className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-400/30"
                    style={{ boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)' }}
                  >
                    <div className="text-2xl font-bold text-blue-400 mb-1" style={{ textShadow: '0 0 10px rgba(59, 130, 246, 0.6)' }}>
                      100%
                    </div>
                    <div className="text-xs text-blue-300 uppercase tracking-wide">
                      Workflow Complete
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Bottom accent glow */}
            <motion.div 
              className="h-1 bg-gradient-to-r from-emerald-400 via-blue-400 to-emerald-400"
              animate={{
                opacity: [0.6, 1, 0.6],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              style={{ boxShadow: '0 0 20px rgba(16, 185, 129, 0.5), 0 0 20px rgba(59, 130, 246, 0.5)' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

