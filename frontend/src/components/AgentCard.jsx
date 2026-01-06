import { motion } from 'framer-motion';
import { 
  FileCheck, 
  FileText, 
  Shield, 
  Hash, 
  CheckCircle2, 
  Send 
} from 'lucide-react';

const agentIcons = {
  'Intake': FileCheck,
  'Extraction': FileText,
  'Policy': Shield,
  'GL Mapper': Hash,
  'Quality': CheckCircle2,
  'Publisher': Send
};

const agentColors = {
  'Intake': 'from-blue-500/20 to-cyan-500/20',
  'Extraction': 'from-purple-500/20 to-pink-500/20',
  'Policy': 'from-orange-500/20 to-red-500/20',
  'GL Mapper': 'from-green-500/20 to-emerald-500/20',
  'Quality': 'from-yellow-500/20 to-amber-500/20',
  'Publisher': 'from-indigo-500/20 to-violet-500/20'
};

export default function AgentCard({ agentName, isActive, thoughtStream, status, isFeedbackLoop }) {
  const Icon = agentIcons[agentName] || FileCheck;
  const gradient = agentColors[agentName] || 'from-gray-500/20 to-gray-600/20';

  return (
    <motion.div
      className={`relative rounded-2xl bg-gradient-to-br ${gradient} backdrop-blur-xl border ${
        isFeedbackLoop ? 'border-red-400/50' : 'border-white/10'
      } shadow-2xl overflow-hidden h-[400px]`}
      animate={isActive ? {
        scale: [1, 1.02, 1],
        boxShadow: [
          '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          '0 25px 30px -5px rgba(0, 0, 0, 0.4), 0 15px 15px -5px rgba(0, 0, 0, 0.3)',
          '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
        ]
      } : {}}
      transition={{
        duration: 2,
        repeat: isActive ? Infinity : 0,
        ease: 'easeInOut'
      }}
    >
      {/* Glassmorphism overlay */}
      <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
      
      {/* Content */}
      <div className="relative p-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <div className={`p-2 rounded-lg bg-white/10 backdrop-blur-sm ${
            isActive ? 'bg-white/20' : ''
          }`}>
            <Icon className={`w-6 h-6 ${
              isActive ? 'text-white' : 'text-white/70'
            }`} />
          </div>
          <h3 className={`text-xl font-semibold ${
            isActive ? 'text-white' : 'text-white/80'
          }`}>
            {agentName}
          </h3>
          {status && (
            <span className="ml-auto text-xs px-2 py-1 rounded-full bg-white/10 text-white/90">
              {status}
            </span>
          )}
        </div>

        {/* Thought Stream - Fixed height with scrolling */}
        <div className="flex-1 bg-black/20 rounded-lg p-4 border border-white/5 overflow-hidden flex flex-col min-h-0">
          <div className="text-xs text-white/60 mb-2 font-mono flex-shrink-0">Thought Stream:</div>
          <div className="font-mono text-sm text-white/90 whitespace-pre-wrap leading-relaxed overflow-y-auto flex-1 min-h-0">
            {thoughtStream || (
              <span className="text-white/40 italic">Waiting for agent activity...</span>
            )}
          </div>
        </div>
      </div>

      {/* Active indicator glow */}
      {isActive && (
        <motion.div
          className={`absolute inset-0 rounded-2xl border-2 ${
            isFeedbackLoop ? 'border-red-400/60' : 'border-white/30'
          }`}
          animate={{
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      )}

      {/* Feedback loop glow effect */}
      {isFeedbackLoop && (
        <motion.div
          className="absolute inset-0 rounded-2xl bg-red-500/10"
          animate={{
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      )}
    </motion.div>
  );
}

