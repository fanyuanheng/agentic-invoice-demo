import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
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
          <div className="text-xs text-white/60 mb-3 font-mono flex-shrink-0 font-semibold">Thought Stream:</div>
          <AutoScrollContainer content={thoughtStream}>
            {thoughtStream ? (
              <FormattedThoughtStream content={thoughtStream} />
            ) : (
              <span className="text-white/40 italic">Waiting for agent activity...</span>
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

