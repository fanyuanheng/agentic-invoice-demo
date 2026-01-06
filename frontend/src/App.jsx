import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AgentCard from './components/AgentCard';
import FileDropZone from './components/FileDropZone';
import { ArrowLeft } from 'lucide-react';
import './App.css';

const AGENTS = ['Intake', 'Extraction', 'Policy', 'GL Mapper', 'Quality', 'Publisher'];

export default function App() {
  const [activeAgent, setActiveAgent] = useState(null);
  const [agentThoughts, setAgentThoughts] = useState({
    'Intake': '',
    'Extraction': '',
    'Policy': '',
    'GL Mapper': '',
    'Quality': '',
    'Publisher': ''
  });
  const [agentStatus, setAgentStatus] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFeedbackLoop, setShowFeedbackLoop] = useState(false);
  const eventSourceRef = useRef(null);

  const clearAgentStates = () => {
    setActiveAgent(null);
    setAgentThoughts({
      'Intake': '',
      'Extraction': '',
      'Policy': '',
      'GL Mapper': '',
      'Quality': '',
      'Publisher': ''
    });
    setAgentStatus({});
    setShowFeedbackLoop(false);
  };

  const handleFileSelect = async (base64Image) => {
    if (isProcessing) return;

    clearAgentStates();
    setIsProcessing(true);
    setShowFeedbackLoop(false);

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const response = await fetch('http://localhost:3001/api/workflow/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64Image,
          prompt: 'Process this invoice through the full workflow'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent(data);
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error streaming workflow:', error);
      setIsProcessing(false);
    }
  };

  const handleSSEEvent = (data) => {
    const { type, agent, content, phase, message, result, errors } = data;

    switch (type) {
      case 'workflow_start':
        setIsProcessing(true);
        break;

      case 'agent_start':
        if (agent) {
          // Normalize agent name (remove "Agent" suffix if present)
          const normalizedAgent = agent.replace(' Agent', '');
          setActiveAgent(normalizedAgent);
          setAgentStatus(prev => ({ ...prev, [normalizedAgent]: 'Starting...' }));
          setAgentThoughts(prev => ({ ...prev, [normalizedAgent]: '' }));
        }
        break;

      case 'reasoning':
        if (agent && content) {
          const normalizedAgent = agent.replace(' Agent', '');
          setAgentThoughts(prev => ({
            ...prev,
            [normalizedAgent]: (prev[normalizedAgent] || '') + content
          }));
        }
        break;

      case 'agent_action':
        if (agent && message) {
          const normalizedAgent = agent.replace(' Agent', '');
          setAgentThoughts(prev => ({
            ...prev,
            [normalizedAgent]: (prev[normalizedAgent] || '') + `\n\n[Action] ${message}\n`
          }));
          setAgentStatus(prev => ({ ...prev, [normalizedAgent]: 'Processing...' }));
        }
        break;

      case 'agent_result':
        if (agent && result) {
          const normalizedAgent = agent.replace(' Agent', '');
          setAgentThoughts(prev => ({
            ...prev,
            [normalizedAgent]: (prev[normalizedAgent] || '') + `\n\n[Result] ${JSON.stringify(result, null, 2)}\n`
          }));
        }
        break;

      case 'correction_loop':
        if (agent === 'Quality Agent' && errors) {
          setShowFeedbackLoop(true);
          setAgentThoughts(prev => ({
            ...prev,
            'Quality': prev['Quality'] + `\n\n[Feedback Loop] Sending ${errors.length} error(s) back to Extraction Agent for correction...\n`
          }));
          // Temporarily activate Extraction agent to show the feedback
          setTimeout(() => {
            setActiveAgent('Extraction');
            setAgentThoughts(prev => ({
              ...prev,
              'Extraction': prev['Extraction'] + `\n\n[Correction Request] Quality Agent found errors:\n${errors.map(e => `- ${e}`).join('\n')}\n\nRe-extracting with corrections...\n`
            }));
          }, 500);
        }
        break;

      case 'agent_complete':
        if (agent) {
          const normalizedAgent = agent.replace(' Agent', '');
          setAgentStatus(prev => ({ ...prev, [normalizedAgent]: 'Complete' }));
          // Move to next agent or clear active
          setTimeout(() => {
            setActiveAgent(null);
          }, 1000);
        }
        break;

      case 'workflow_complete':
        setIsProcessing(false);
        setActiveAgent(null);
        setAgentStatus(prev => {
          const updated = { ...prev };
          AGENTS.forEach(agent => {
            updated[agent] = 'Complete';
          });
          return updated;
        });
        break;

      case 'error':
        console.error('Workflow error:', data);
        setIsProcessing(false);
        break;

      case 'done':
        setIsProcessing(false);
        setActiveAgent(null);
        break;
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-purple-200 to-white">
            Agentic Invoice Processing
          </h1>
          <p className="text-white/60 text-lg">
            Multi-agent workflow with self-healing capabilities
          </p>
        </div>

        {/* File Drop Zone */}
        <div className="mb-8">
          <FileDropZone 
            onFileSelect={handleFileSelect} 
            isProcessing={isProcessing}
          />
        </div>

        {/* Agent Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 relative">
          {AGENTS.map((agent, index) => (
            <div key={agent} className="relative">
              <AgentCard
                agentName={agent}
                isActive={activeAgent === agent}
                thoughtStream={agentThoughts[agent]}
                status={agentStatus[agent]}
                isFeedbackLoop={showFeedbackLoop && (agent === 'Quality' || agent === 'Extraction')}
              />
              
              {/* Feedback Loop Indicator - Quality to Extraction */}
              {showFeedbackLoop && agent === 'Extraction' && (
                <motion.div
                  className="absolute -top-16 left-1/2 transform -translate-x-1/2 z-30"
                  initial={{ opacity: 0, y: -20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.8 }}
                >
                  <div className="flex flex-col items-center bg-red-500/30 backdrop-blur-md rounded-xl px-5 py-3 border-2 border-red-400/70 shadow-2xl shadow-red-500/50">
                    <motion.div
                      className="text-red-200 text-xs font-bold mb-2 uppercase tracking-wider"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      ⚠️ Correction Loop
                    </motion.div>
                    <motion.div
                      animate={{ 
                        x: [-8, 8, -8],
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ 
                        duration: 1.5, 
                        repeat: Infinity,
                        ease: 'easeInOut'
                      }}
                    >
                      <ArrowLeft 
                        className="w-12 h-12 text-red-400 drop-shadow-lg" 
                        strokeWidth={3}
                      />
                    </motion.div>
                    <motion.div
                      className="text-red-300 text-xs mt-2 text-center"
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}
                    >
                      Quality → Extraction
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </div>
          ))}
        </div>

        {/* Status Footer */}
        {isProcessing && (
          <motion.div
            className="text-center mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
              <motion.div
                className="w-2 h-2 bg-green-400 rounded-full"
                animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="text-white/80 text-sm">Workflow in progress...</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
