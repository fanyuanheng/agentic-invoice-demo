import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

const AGENTS = ['Intake', 'Extraction', 'Policy', 'GL Mapper', 'Quality', 'Publisher'];

export default function LightTrails({ agentRefs, activeAgent, isCorrectionLoop, onAnimationComplete }) {
  const svgRef = useRef(null);
  const [paths, setPaths] = useState([]);
  const [pathLengths, setPathLengths] = useState({});
  const progress = useMotionValue(0);
  const [isReversing, setIsReversing] = useState(false);
  const [currentPathIndex, setCurrentPathIndex] = useState(0);

  // Calculate paths between agent cards
  const calculatePaths = () => {
    if (!agentRefs || Object.keys(agentRefs).length < AGENTS.length) return;

    const newPaths = [];
    const newPathLengths = {};

    for (let i = 0; i < AGENTS.length - 1; i++) {
      const fromAgent = AGENTS[i];
      const toAgent = AGENTS[i + 1];
      
      const fromRef = agentRefs[fromAgent];
      const toRef = agentRefs[toAgent];

      const fromElement = fromRef?.current || fromRef;
      const toElement = toRef?.current || toRef;
      
      if (fromElement && toElement && svgRef.current) {
        const fromRect = fromElement.getBoundingClientRect();
        const toRect = toElement.getBoundingClientRect();
        const svgRect = svgRef.current.getBoundingClientRect();

        // Calculate center points relative to SVG
        const fromX = fromRect.left + fromRect.width / 2 - svgRect.left;
        const fromY = fromRect.top + fromRect.height / 2 - svgRect.top;
        const toX = toRect.left + toRect.width / 2 - svgRect.left;
        const toY = toRect.top + toRect.height / 2 - svgRect.top;

        // Create a curved path using quadratic bezier
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        const controlX = midX;
        const controlY = midY - Math.abs(toY - fromY) * 0.3; // Curve upward

        const pathId = `path-${i}`;
        const pathData = `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`;
        
        // Calculate path length
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttribute('d', pathData);
        const length = pathElement.getTotalLength();

        newPaths.push({
          id: pathId,
          from: fromAgent,
          to: toAgent,
          d: pathData,
          index: i
        });
        newPathLengths[pathId] = length;
      }
    }

    setPaths(newPaths);
    setPathLengths(newPathLengths);
  };

  useEffect(() => {
    // Delay to ensure DOM is ready
    const timer = setTimeout(() => {
      calculatePaths();
    }, 100);
    
    // Recalculate on window resize
    const handleResize = () => {
      setTimeout(calculatePaths, 100);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeAgent]); // Recalculate when active agent changes

  // Handle animation based on active agent
  useEffect(() => {
    if (!activeAgent || paths.length === 0) {
      progress.set(0);
      return;
    }

    const agentIndex = AGENTS.indexOf(activeAgent);
    if (agentIndex === -1) return;

    // If correction loop, animate backwards from Quality to Extraction
    if (isCorrectionLoop && activeAgent === 'Quality') {
      setIsReversing(true);
      // Animate backwards: Quality (4) -> GL Mapper (3) -> Policy (2) -> Extraction (1)
      // We need to reverse paths: path[3], path[2], path[1]
      const reversePaths = [3, 2, 1].filter(idx => idx < paths.length);
      
      const animateReversePath = (pathIdx, pathIndex) => {
        if (pathIndex >= reversePaths.length) {
          setIsReversing(false);
          progress.set(0);
          if (onAnimationComplete) {
            onAnimationComplete();
          }
          return;
        }
        
        const idx = reversePaths[pathIndex];
        const path = paths[idx];
        if (path) {
          setCurrentPathIndex(idx);
          const pathLength = pathLengths[path.id] || 0;
          progress.set(pathLength); // Start from end
          
          animate(progress, 0, {
            duration: 1.2,
            ease: 'easeInOut',
            onComplete: () => {
              animateReversePath(idx, pathIndex + 1);
            }
          });
        }
      };
      
      if (reversePaths.length > 0) {
        animateReversePath(reversePaths[0], 0);
      }
      return;
    }
    
    // If correction loop and we're back at Extraction, reset reversing state and continue forward
    if (isCorrectionLoop && activeAgent === 'Extraction') {
      setIsReversing(false);
      // After correction loop, continue from Extraction to Policy (path[1])
      const pathIndex = 1;
      setCurrentPathIndex(pathIndex);
      const path = paths[pathIndex];
      if (path) {
        const pathLength = pathLengths[path.id] || 0;
        progress.set(0);
        animate(progress, pathLength, {
          duration: 2,
          ease: 'easeInOut',
          onComplete: () => {
            if (onAnimationComplete) {
              onAnimationComplete();
            }
          }
        });
      }
      return;
    }

    // Normal forward animation
    setIsReversing(false);
    
    if (agentIndex === 0) {
      // Starting from Intake, animate to Extraction
      setCurrentPathIndex(0);
      progress.set(0);
      const path = paths[0];
      if (path) {
        const pathLength = pathLengths[path.id] || 0;
        animate(progress, pathLength, {
          duration: 2,
          ease: 'easeInOut',
          onComplete: () => {
            if (onAnimationComplete) {
              onAnimationComplete();
            }
          }
        });
      }
    } else if (agentIndex > 0 && agentIndex < AGENTS.length) {
      // Animate to current agent
      const pathIndex = agentIndex - 1;
      setCurrentPathIndex(pathIndex);
      const path = paths[pathIndex];
      if (path) {
        const pathLength = pathLengths[path.id] || 0;
        progress.set(0);
        animate(progress, pathLength, {
          duration: 2,
          ease: 'easeInOut',
          onComplete: () => {
            if (onAnimationComplete) {
              onAnimationComplete();
            }
          }
        });
      }
    }
  }, [activeAgent, isCorrectionLoop, paths, pathLengths, progress, onAnimationComplete]);

  // Get point along path for pulse animation
  const getPointAtLength = (pathData, length) => {
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('d', pathData);
    const point = pathElement.getPointAtLength(length);
    return point;
  };

  const currentPath = paths[currentPathIndex];
  const currentPathLength = currentPath ? (pathLengths[currentPath.id] || 0) : 0;
  const pulsePosition = useTransform(progress, (value) => {
    if (!currentPath || currentPathLength === 0) return { x: 0, y: 0 };
    const length = isReversing ? currentPathLength - value : value;
    const point = getPointAtLength(currentPath.d, Math.max(0, Math.min(length, currentPathLength)));
    return { x: point.x, y: point.y };
  });

  if (paths.length === 0) return null;

  if (paths.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      style={{ overflow: 'visible' }}
      preserveAspectRatio="none"
    >
      <defs>
        {/* Gradient for light trail */}
        <linearGradient id="lightTrailGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(139, 92, 246, 0)" stopOpacity="0" />
          <stop offset="50%" stopColor="rgba(139, 92, 246, 0.6)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" stopOpacity="0" />
        </linearGradient>
        
        {/* Gradient for correction loop (red) */}
        <linearGradient id="correctionTrailGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(239, 68, 68, 0)" stopOpacity="0" />
          <stop offset="50%" stopColor="rgba(239, 68, 68, 0.8)" stopOpacity="0.8" />
          <stop offset="100%" stopColor="rgba(239, 68, 68, 0)" stopOpacity="0" />
        </linearGradient>

        {/* Glow filter for pulse */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Draw all paths */}
      {paths.map((path, index) => {
        const isActive = index === currentPathIndex;
        const isCorrectionPath = isCorrectionLoop && isActive && isReversing;
        
        return (
          <g key={path.id}>
            {/* Base path (subtle) */}
            <path
              d={path.d}
              fill="none"
              stroke={isCorrectionPath ? 'rgba(239, 68, 68, 0.2)' : 'rgba(139, 92, 246, 0.15)'}
              strokeWidth="2"
              strokeDasharray="5,5"
            />
            
            {/* Animated light trail */}
            {isActive && (
              <motion.path
                d={path.d}
                fill="none"
                stroke={isCorrectionPath ? 'url(#correctionTrailGradient)' : 'url(#lightTrailGradient)'}
                strokeWidth="4"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ 
                  pathLength: isReversing 
                    ? [currentPathLength, 0] 
                    : [0, currentPathLength]
                }}
                transition={{ 
                  duration: isCorrectionPath ? 1.5 : 2,
                  ease: 'easeInOut'
                }}
                style={{ filter: 'url(#glow)' }}
              />
            )}
          </g>
        );
      })}

      {/* Animated pulse circle */}
      {currentPath && activeAgent && (
        <motion.circle
          r="8"
          fill={isReversing && isCorrectionLoop ? '#ef4444' : '#8b5cf6'}
          filter="url(#glow)"
          style={{
            x: pulsePosition.x,
            y: pulsePosition.y,
          }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.8, 1, 0.8],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      )}
    </svg>
  );
}

