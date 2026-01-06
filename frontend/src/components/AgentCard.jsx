import { motion, useMotionValue, useTransform, animate, useMotionValueEvent } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { 
  FileCheck, 
  FileText, 
  Shield, 
  Hash, 
  CheckCircle2, 
  Send 
} from 'lucide-react';

// Component that auto-scrolls to bottom when content changes
function AutoScrollContainer({ children, content }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [content]);

  return (
    <div 
      ref={scrollRef}
      className="font-mono text-sm text-white/90 leading-relaxed overflow-y-auto flex-1 min-h-0 scroll-smooth"
    >
      {children}
    </div>
  );
}

// Component to format thought stream content with better readability
function FormattedThoughtStream({ content }) {
  // Split content into blocks by special tags
  const blocks = [];
  let currentText = [];
  let i = 0;
  const lines = content.split('\n');

  const flushText = () => {
    if (currentText.length > 0) {
      const text = currentText.join('\n').trim();
      if (text) {
        blocks.push({ type: 'text', content: text });
      }
      currentText = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    
    // Check for [Action] tag
    if (line.match(/^\[Action\]/)) {
      flushText();
      const actionText = line.replace(/^\[Action\]\s*/, '');
      blocks.push({ type: 'action', content: actionText, tag: 'Action' });
      i++;
    }
    // Check for [Result] tag - may span multiple lines
    else if (line.match(/^\[Result\]/)) {
      flushText();
      let resultContent = line.replace(/^\[Result\]\s*/, '');
      i++;
      
      // Collect JSON content (may span multiple lines)
      let braceCount = (resultContent.match(/{/g) || []).length - (resultContent.match(/}/g) || []).length;
      
      while (i < lines.length && braceCount > 0) {
        resultContent += '\n' + lines[i];
        braceCount += (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length;
        i++;
      }
      
      // Try to parse and reformat JSON
      try {
        const jsonMatch = resultContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          blocks.push({ 
            type: 'result', 
            content: JSON.stringify(parsed, null, 2),
            tag: 'Result'
          });
        } else {
          blocks.push({ type: 'result', content: resultContent, tag: 'Result' });
        }
      } catch (e) {
        blocks.push({ type: 'result', content: resultContent, tag: 'Result' });
      }
    }
    // Check for [Feedback Loop] tag
    else if (line.match(/^\[Feedback Loop\]/)) {
      flushText();
      const feedbackText = line.replace(/^\[Feedback Loop\]\s*/, '');
      blocks.push({ type: 'feedback', content: feedbackText, tag: 'Feedback Loop' });
      i++;
    }
    // Check for [Correction Request] tag - may span multiple lines
    else if (line.match(/^\[Correction Request\]/)) {
      flushText();
      let correctionContent = line.replace(/^\[Correction Request\]\s*/, '');
      i++;
      
      // Collect multi-line correction content until next tag or empty line
      while (i < lines.length && !lines[i].match(/^\[/) && lines[i].trim() !== '') {
        correctionContent += '\n' + lines[i];
        i++;
      }
      
      blocks.push({ type: 'correction', content: correctionContent, tag: 'Correction Request' });
    }
    // Regular text line
    else {
      if (line.trim() === '' && currentText.length > 0) {
        // Empty line after text - add separator
        flushText();
        blocks.push({ type: 'separator' });
      } else if (line.trim() !== '') {
        currentText.push(line);
      }
      i++;
    }
  }
  
  flushText();

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        if (block.type === 'separator') {
          return <div key={idx} className="h-2" />;
        }
        
        if (block.type === 'action') {
          return (
            <div key={idx} className="mb-3">
              <span className="inline-block px-2.5 py-1 mb-1.5 text-xs font-bold rounded-md bg-blue-500/30 text-blue-200 border border-blue-400/50 uppercase tracking-wide">
                {block.tag}
              </span>
              <p className="text-blue-100 mt-1.5 leading-relaxed break-words">{block.content}</p>
            </div>
          );
        }
        
        if (block.type === 'feedback') {
          return (
            <div key={idx} className="mb-3">
              <span className="inline-block px-2.5 py-1 mb-1.5 text-xs font-bold rounded-md bg-yellow-500/30 text-yellow-200 border border-yellow-400/50 uppercase tracking-wide">
                {block.tag}
              </span>
              <p className="text-yellow-100 mt-1.5 leading-relaxed break-words">{block.content}</p>
            </div>
          );
        }
        
        if (block.type === 'correction') {
          return (
            <div key={idx} className="mb-3">
              <span className="inline-block px-2.5 py-1 mb-1.5 text-xs font-bold rounded-md bg-red-500/30 text-red-200 border border-red-400/50 uppercase tracking-wide">
                {block.tag}
              </span>
              <div className="mt-1.5 text-red-100 leading-relaxed">
                {block.content.split('\n').map((line, lineIdx) => (
                  <p key={lineIdx} className="mb-1 break-words">
                    {line.startsWith('-') ? (
                      <span className="text-red-300 font-semibold">{line}</span>
                    ) : (
                      line
                    )}
                  </p>
                ))}
              </div>
            </div>
          );
        }
        
        if (block.type === 'result') {
          return (
            <div key={idx} className="mb-3">
              <span className="inline-block px-2.5 py-1 mb-1.5 text-xs font-bold rounded-md bg-green-500/30 text-green-200 border border-green-400/50 uppercase tracking-wide">
                {block.tag}
              </span>
              <pre className="mt-2 p-3 bg-black/40 rounded-md text-xs text-green-100 overflow-x-auto border border-green-500/20 font-mono leading-relaxed">
                <code className="whitespace-pre">{block.content}</code>
              </pre>
            </div>
          );
        }
        
        // Regular text block
        if (block.type === 'text' && block.content) {
          return (
            <div key={idx} className="text-white/85 leading-relaxed">
              {block.content.split('\n').map((textLine, lineIdx) => (
                <p key={lineIdx} className="mb-1.5 break-words">
                  {textLine || '\u00A0'}
                </p>
              ))}
            </div>
          );
        }
        
        return null;
      })}
    </div>
  );
}

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

// Confidence Meter Component
function ConfidenceMeter({ confidence }) {
  const count = useMotionValue(0);
  const widthPercent = useTransform(count, (value) => `${Math.min(100, Math.max(0, value))}%`);
  const [displayValue, setDisplayValue] = useState(0);

  // Subscribe to motion value changes to update display value
  useMotionValueEvent(count, "change", (latest) => {
    setDisplayValue(Math.round(latest));
  });

  useEffect(() => {
    if (confidence !== null && confidence !== undefined) {
      const controls = animate(count, confidence, {
        duration: 2,
        ease: 'easeOut'
      });
      return controls.stop;
    } else {
      count.set(0);
      setDisplayValue(0);
    }
  }, [confidence, count]);

  if (confidence === null || confidence === undefined) {
    return null;
  }

  return (
    <div className="mb-4 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/70 font-semibold uppercase tracking-wide">
          Confidence Score
        </span>
        <span className="text-lg font-bold text-yellow-300 tabular-nums">
          {displayValue}%
        </span>
      </div>
      <div className="relative h-3 bg-black/30 rounded-full overflow-hidden border border-white/10">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 rounded-full"
          style={{ width: widthPercent }}
        />
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          animate={{
            x: ['-100%', '200%']
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear'
          }}
        />
      </div>
    </div>
  );
}

export default function AgentCard({ agentName, stepNumber, isActive, thoughtStream, status, isFeedbackLoop, confidence }) {
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
      
      {/* Step Number Badge */}
      <div className="absolute top-4 right-4 z-30">
        <motion.div
          className={`relative w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
            isActive
              ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/50'
              : 'bg-white/10 backdrop-blur-md border border-white/20 text-white/80'
          }`}
          animate={isActive ? {
            scale: [1, 1.1, 1],
          } : {}}
          transition={{
            duration: 1.5,
            repeat: isActive ? Infinity : 0,
            ease: 'easeInOut'
          }}
        >
          {stepNumber}
          {isActive && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-purple-400/60"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.8, 0, 0.8],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeOut'
              }}
            />
          )}
        </motion.div>
      </div>
      
      {/* Agent Badge/Header Section */}
      <div className="relative bg-gradient-to-r from-black/30 to-transparent border-b border-white/10 pb-4 pt-6 px-6">
        <div className="flex items-center gap-4">
          {/* Agent Avatar/Icon */}
          <motion.div 
            className={`relative p-3 rounded-xl bg-gradient-to-br ${
              isActive 
                ? 'from-white/30 to-white/10 shadow-lg shadow-white/20' 
                : 'from-white/10 to-white/5'
            } backdrop-blur-md border ${
              isActive ? 'border-white/30' : 'border-white/10'
            }`}
            animate={isActive ? {
              rotate: [0, 5, -5, 0],
            } : {}}
            transition={{
              duration: 2,
              repeat: isActive ? Infinity : 0,
              ease: 'easeInOut'
            }}
          >
            <Icon className={`w-7 h-7 ${
              isActive ? 'text-white drop-shadow-lg' : 'text-white/70'
            }`} />
            {/* Active pulse indicator */}
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-xl border-2 border-white/40"
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              />
            )}
          </motion.div>
          
          {/* Agent Name and Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`text-xl font-bold ${
                isActive ? 'text-white drop-shadow-md' : 'text-white/90'
              }`}>
                {agentName}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70 font-medium">
                Agent
              </span>
            </div>
            {status && (
              <div className="flex items-center gap-2">
                <motion.div
                  className={`w-2 h-2 rounded-full ${
                    status === 'Complete' ? 'bg-green-400' :
                    status === 'Processing...' || status === 'Starting...' ? 'bg-blue-400' :
                    status.includes('Waiting') ? 'bg-yellow-400' :
                    'bg-gray-400'
                  }`}
                  animate={isActive && status !== 'Complete' ? {
                    scale: [1, 1.3, 1],
                    opacity: [1, 0.7, 1],
                  } : {}}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
                <span className="text-xs text-white/70 font-medium">{status}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="relative p-6 h-full flex flex-col">

        {/* Confidence Meter - Only for Quality Agent */}
        {agentName === 'Quality' && (
          <ConfidenceMeter confidence={confidence} />
        )}

        {/* Thought Stream - Fixed height with scrolling */}
        <div className="flex-1 bg-black/20 rounded-lg p-4 border border-white/5 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
            <div className="text-xs text-white/60 font-mono font-semibold uppercase tracking-wider">Thought Stream</div>
          </div>
          <AutoScrollContainer content={thoughtStream}>
            {thoughtStream ? (
              <FormattedThoughtStream content={thoughtStream} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                  <Icon className="w-6 h-6 text-white/30" />
                </div>
                <span className="text-white/40 italic text-sm">Waiting for agent activity...</span>
              </div>
            )}
          </AutoScrollContainer>
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

