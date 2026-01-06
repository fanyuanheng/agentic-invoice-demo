import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AgentCard from './components/AgentCard';
import FileDropZone from './components/FileDropZone';
import LightTrails from './components/LightTrails';
import ExecutiveSummary from './components/ExecutiveSummary';
import HumanIntervention from './components/HumanIntervention';
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
  const [qualityConfidence, setQualityConfidence] = useState(null);
  const [agenticDecisions, setAgenticDecisions] = useState([]);
  const [workflowComplete, setWorkflowComplete] = useState(false);
  const [humanIntervention, setHumanIntervention] = useState(null);
  const eventSourceRef = useRef(null);
  
  // Create refs for each agent card
  const intakeRef = useRef(null);
  const extractionRef = useRef(null);
  const policyRef = useRef(null);
  const glMapperRef = useRef(null);
  const qualityRef = useRef(null);
  const publisherRef = useRef(null);
  
  const agentRefs = {
    'Intake': intakeRef,
    'Extraction': extractionRef,
    'Policy': policyRef,
    'GL Mapper': glMapperRef,
    'Quality': qualityRef,
    'Publisher': publisherRef
  };

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
    setQualityConfidence(null);
    setAgenticDecisions([]);
    setWorkflowComplete(false);
    setHumanIntervention(null);
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
      // Use environment variable if set, otherwise use relative URL (works in production)
      // or localhost for development
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
      const response = await fetch(`${apiUrl}/api/workflow/stream`, {
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
    try {
      const { type, agent, content, phase, message, result, errors } = data || {};

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
          try {
            const normalizedAgent = agent.replace(' Agent', '');
            
            // Safely stringify result, handling circular references or large objects
            let resultString = '';
            try {
              resultString = JSON.stringify(result, null, 2);
            } catch (e) {
              // If stringify fails, create a safe representation
              resultString = typeof result === 'object' 
                ? JSON.stringify({ 
                    type: typeof result,
                    keys: Object.keys(result || {}),
                    message: 'Result data (unable to stringify fully)'
                  }, null, 2)
                : String(result);
            }
            
            setAgentThoughts(prev => ({
              ...prev,
              [normalizedAgent]: (prev[normalizedAgent] || '') + `\n\n[Result] ${resultString}\n`
            }));
            
            // Extract confidence score for Quality Agent
            if (normalizedAgent === 'Quality' && result.confidence !== undefined) {
              setQualityConfidence(result.confidence);
            } else if (normalizedAgent === 'Quality' && result.verified !== undefined) {
              // Calculate confidence based on verification status
              // If verified with no errors, high confidence; if errors found, lower confidence
              const calculatedConfidence = result.errors && Array.isArray(result.errors) && result.errors.length > 0 
                ? Math.max(0, 100 - (result.errors.length * 20))
                : 95;
              setQualityConfidence(calculatedConfidence);
            }
          } catch (error) {
            console.error('Error handling agent result:', error);
          }
        }
        break;

      case 'human_intervention_required':
        try {
          // Validate data before setting state
          if (!data.interventionId) {
            console.error('human_intervention_required: Missing interventionId', data);
            break;
          }
          
          // Safely extract and sanitize extractedData to ensure all values are primitives
          const rawExtractedData = data.extractedData || {};
          const sanitizedExtractedData = {
            vendor: typeof rawExtractedData.vendor === 'string' || typeof rawExtractedData.vendor === 'number' 
              ? String(rawExtractedData.vendor) 
              : 'N/A',
            invoiceNumber: typeof rawExtractedData.invoiceNumber === 'string' || typeof rawExtractedData.invoiceNumber === 'number'
              ? String(rawExtractedData.invoiceNumber)
              : 'N/A',
            date: typeof rawExtractedData.date === 'string' || typeof rawExtractedData.date === 'number'
              ? String(rawExtractedData.date)
              : 'N/A',
            subtotal: typeof rawExtractedData.subtotal === 'number' ? rawExtractedData.subtotal : null,
            tax: typeof rawExtractedData.tax === 'number' ? rawExtractedData.tax : null,
            total: typeof rawExtractedData.total === 'number' ? rawExtractedData.total : null,
            lineItems: Array.isArray(rawExtractedData.lineItems) ? rawExtractedData.lineItems : []
          };
          
          const interventionData = {
            errors: Array.isArray(data.errors) ? data.errors.map(e => String(e || '')) : [],
            violations: Array.isArray(data.violations) ? data.violations.map(v => String(v || '')) : [],
            correctiveActions: Array.isArray(data.correctiveActions) ? data.correctiveActions : [],
            extractedData: sanitizedExtractedData,
            interventionId: String(data.interventionId),
            message: String(data.message || 'Agent detected issues that require human review')
          };
          
          setHumanIntervention(interventionData);
          // Determine which agent needs intervention
          const agentName = data.agent === 'Policy Agent' ? 'Policy' : 'Quality';
          const issueType = interventionData.errors.length > 0 ? 'calculation error(s)' : 'policy violation(s)';
          const issueCount = interventionData.errors.length || interventionData.violations.length;
          
          setAgentStatus(prev => ({ ...prev, [agentName]: 'Waiting for human decision...' }));
          setAgentThoughts(prev => ({
            ...prev,
            [agentName]: (prev[agentName] || '') + `\n\n[Human Intervention Required] ${issueCount} ${issueType} detected. Waiting for human decision...\n`
          }));
        } catch (error) {
          console.error('Error handling human intervention:', error, data);
          // Don't crash - show error message instead
          setAgentThoughts(prev => ({
            ...prev,
            'Quality': (prev['Quality'] || '') + `\n\n[Error] Failed to display intervention modal: ${error.message}\n`
          }));
        }
        break;

      case 'intervention_pending':
        // Workflow is paused, waiting for user decision
        setAgentStatus(prev => ({ ...prev, 'Quality': 'Waiting for human decision...' }));
        break;

      case 'intervention_decision':
        if (data.decision === 'accepted') {
          setHumanIntervention(null);
          setAgentStatus(prev => ({ ...prev, 'Quality': 'Proceeding after user acceptance...' }));
          setAgentThoughts(prev => ({
            ...prev,
            'Quality': (prev['Quality'] || '') + `\n\n[Decision] User accepted data with errors. Workflow continuing...\n`
          }));
          // Keep isProcessing true so workflow can continue
        } else if (data.decision === 'declined') {
          setHumanIntervention(null);
          setIsProcessing(false);
          setActiveAgent(null);
          setAgentStatus(prev => ({ ...prev, 'Quality': 'Stopped by user' }));
          setAgentThoughts(prev => ({
            ...prev,
            'Quality': (prev['Quality'] || '') + `\n\n[Decision] User declined to proceed. Workflow stopped.\n`
          }));
        }
        break;

      case 'workflow_stopped':
        setIsProcessing(false);
        setActiveAgent(null);
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
        // Set agentic decisions and mark workflow as complete
        if (data.agenticDecisions) {
          setAgenticDecisions(data.agenticDecisions);
        }
        setWorkflowComplete(true);
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
    } catch (error) {
      console.error('Error in handleSSEEvent:', error, data);
      // Don't crash the app, just log the error
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
          {/* Light Trails SVG Overlay */}
          {isProcessing && (
            <LightTrails
              agentRefs={agentRefs}
              activeAgent={activeAgent}
              isCorrectionLoop={showFeedbackLoop}
              onAnimationComplete={() => {
                // Animation complete callback
              }}
            />
          )}
          
          {AGENTS.map((agent, index) => (
            <div 
              key={agent} 
              className="relative z-10"
              ref={agentRefs[agent]}
            >
              <AgentCard
                agentName={agent}
                isActive={activeAgent === agent}
                thoughtStream={agentThoughts[agent]}
                status={agentStatus[agent]}
                isFeedbackLoop={showFeedbackLoop && (agent === 'Quality' || agent === 'Extraction')}
                confidence={agent === 'Quality' ? qualityConfidence : null}
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

        {/* Executive Summary Panel */}
        <ExecutiveSummary 
          agenticDecisions={agenticDecisions}
          isVisible={workflowComplete}
        />
      </div>

      {/* Human Intervention Modal */}
      <HumanIntervention
        intervention={humanIntervention}
        onDecision={async (interventionId, decision) => {
          try {
            // Use environment variable if set, otherwise use relative URL (works in production)
            // or localhost for development
            const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
            const response = await fetch(`${apiUrl}/api/workflow/intervention`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                interventionId,
                decision
              })
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Intervention decision result:', result);
          } catch (error) {
            console.error('Error sending intervention decision:', error);
            // Still clear the intervention UI even if there's an error
            setHumanIntervention(null);
          }
        }}
      />
    </div>
  );
}
