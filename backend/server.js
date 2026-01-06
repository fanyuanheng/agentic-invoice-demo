require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

// Store for pending workflow interventions
const pendingInterventions = new Map();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Google Generative AI
const genAI = process.env.GOOGLE_API_KEY 
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null;

// Helper function to send SSE message
function sendSSE(res, type, data) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

// Helper function to stream Gemini reasoning
async function streamReasoning(model, prompt, imagePart, res, agentName, phase) {
  const reasoningPrompt = `You are the ${agentName}. ${phase} phase: ${prompt}\n\nThink out loud about this step. Show your reasoning process step by step.`;
  
  const parts = imagePart ? [reasoningPrompt, imagePart] : [reasoningPrompt];
  const result = await model.generateContentStream(parts);
  
  let fullReasoning = '';
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    if (chunkText) {
      fullReasoning += chunkText;
      sendSSE(res, 'reasoning', {
        agent: agentName,
        phase,
        content: chunkText
      });
    }
  }
  
  return fullReasoning;
}

// Agent 1: Intake Agent
async function intakeAgent(imageData, mimeType, imageBuffer, model, res) {
  sendSSE(res, 'agent_start', { agent: 'Intake Agent', step: 1 });
  
  // Reasoning phase
  const reasoningPrompt = `Analyze this invoice image file. Check:
1. File integrity - is the image valid and readable?
2. Duplicate detection - does this look like a file we've seen before? (Check for similar layouts, dates, vendor names)
3. Image quality - is the image blurry, too dark, or have poor resolution that might affect extraction?

Think through each of these checks systematically.`;
  
  const imagePart = {
    inlineData: {
      data: imageData,
      mimeType: mimeType
    }
  };
  
  const reasoning = await streamReasoning(model, reasoningPrompt, imagePart, res, 'Intake Agent', 'Reasoning');
  
  // Action phase
  sendSSE(res, 'agent_action', { agent: 'Intake Agent', message: 'Performing file validation and quality checks...' });
  
  const actionPrompt = `Based on your reasoning, provide a JSON response with:
{
  "status": "valid" | "warning" | "error",
  "fileIntegrity": boolean,
  "isDuplicate": boolean,
  "isBlurry": boolean,
  "warnings": [array of warning messages],
  "sanitized": true
}`;
  
  const actionResult = await model.generateContent([actionPrompt, imagePart]);
  const actionText = actionResult.response.text();
  
  // Try to extract JSON from response
  let intakeResult = { status: 'valid', fileIntegrity: true, isDuplicate: false, isBlurry: false, warnings: [], sanitized: true };
  try {
    const jsonMatch = actionText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      intakeResult = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // If JSON parsing fails, create result from text
    if (actionText.toLowerCase().includes('duplicate') || actionText.toLowerCase().includes('seen before')) {
      intakeResult.isDuplicate = true;
      intakeResult.warnings.push('Possible duplicate invoice detected');
    }
    if (actionText.toLowerCase().includes('blurry') || actionText.toLowerCase().includes('unclear')) {
      intakeResult.isBlurry = true;
      intakeResult.warnings.push('Image quality may affect extraction accuracy');
    }
  }
  
  sendSSE(res, 'agent_result', { agent: 'Intake Agent', result: intakeResult });
  
  sendSSE(res, 'agent_complete', { agent: 'Intake Agent' });
  
  return { intakeResult, reasoning };
}

// Agent 2: Extraction Agent
async function extractionAgent(imageData, mimeType, model, res) {
  sendSSE(res, 'agent_start', { agent: 'Extraction Agent', step: 2 });
  
  // Reasoning phase
  const reasoningPrompt = `You need to extract structured data from this invoice image. Think about:
1. What fields are clearly visible and easy to extract?
2. What fields are ambiguous or unclear?
3. What extraction strategy will you use for different field types?
4. How will you handle missing or unclear information?`;
  
  const imagePart = {
    inlineData: {
      data: imageData,
      mimeType: mimeType
    }
  };
  
  const reasoning = await streamReasoning(model, reasoningPrompt, imagePart, res, 'Extraction Agent', 'Reasoning');
  
  // Action phase
  sendSSE(res, 'agent_action', { agent: 'Extraction Agent', message: 'Extracting structured data from invoice...' });
  
  const extractionPrompt = `Extract all invoice data and return as JSON with this exact structure:
{
  "vendor": string,
  "invoiceNumber": string,
  "date": string (YYYY-MM-DD),
  "dueDate": string (YYYY-MM-DD),
  "subtotal": number,
  "tax": number,
  "total": number,
  "lineItems": [
    {
      "description": string,
      "quantity": number,
      "unitPrice": number,
      "amount": number
    }
  ],
  "taxRate": number (as decimal, e.g., 0.08 for 8%),
  "currency": string
}

Be precise with numbers. Extract exactly what you see.`;
  
  const extractionResult = await model.generateContent([extractionPrompt, imagePart]);
  const extractionText = extractionResult.response.text();
  
  let extractedData = {};
  try {
    const jsonMatch = extractionText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      extractedData = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    sendSSE(res, 'error', { agent: 'Extraction Agent', message: 'Failed to parse extraction JSON' });
  }
  
  sendSSE(res, 'agent_result', { agent: 'Extraction Agent', result: extractedData });
  
  sendSSE(res, 'agent_complete', { agent: 'Extraction Agent' });
  
  return { extractedData, reasoning };
}

// Agent 3: Policy Agent
async function policyAgent(extractedData, model, res, interventionId = null) {
  sendSSE(res, 'agent_start', { agent: 'Policy Agent', step: 3 });
  
  // Mock policy rules
  const policies = [
    { rule: 'Senior approval needed for amounts > $5000', check: (data) => data.total > 5000 },
    { rule: 'CFO approval needed for amounts > $10000', check: (data) => data.total > 10000 },
    { rule: 'Tax rate must be between 0% and 20%', check: (data) => data.taxRate >= 0 && data.taxRate <= 0.20 },
    { rule: 'Invoice date cannot be more than 90 days old', check: (data) => {
      const invoiceDate = new Date(data.date);
      const daysDiff = (Date.now() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 90;
    }}
  ];
  
  // Reasoning phase
  const reasoningPrompt = `Review this invoice data against company policies:
${policies.map(p => `- ${p.rule}`).join('\n')}

Think about which policies apply to this invoice and what the consequences would be if any are violated.`;
  
  const dataContext = JSON.stringify(extractedData, null, 2);
  const reasoning = await streamReasoning(model, `${reasoningPrompt}\n\nInvoice Data:\n${dataContext}`, null, res, 'Policy Agent', 'Reasoning');
  
  // Action phase
  sendSSE(res, 'agent_action', { agent: 'Policy Agent', message: 'Checking invoice against policy rules...' });
  
  const violations = [];
  const checks = policies.map(policy => {
    const passed = policy.check(extractedData);
    if (!passed) {
      violations.push(policy.rule);
    }
    return { rule: policy.rule, passed };
  });
  
  // Get corrective action suggestions from Gemini
  const actionPrompt = `For each policy violation, suggest a corrective action. Violations: ${violations.join(', ')}. Invoice total: $${extractedData.total}.`;
  
  let correctiveActions = [];
  let requiresIntervention = false;
  let interventionData = null;
  
  if (violations.length > 0) {
    const actionResult = await model.generateContent([actionPrompt]);
    const actionText = actionResult.response.text();
    
    // Extract suggested actions
    correctiveActions = violations.map(violation => {
      if (violation.includes('$5000') || violation.includes('$10000')) {
        if (extractedData.total > 10000) {
          return { violation, action: 'Forwarding to CFO for exception approval' };
        } else if (extractedData.total > 5000) {
          return { violation, action: 'Forwarding to Senior Manager for approval' };
        }
      }
      return { violation, action: actionText.includes('CFO') ? 'Escalate to CFO' : 'Review required' };
    });
    
    // Flag for human intervention
    requiresIntervention = true;
    interventionData = {
      violations: Array.isArray(violations) ? violations : [],
      correctiveActions: correctiveActions,
      extractedData: {
        vendor: extractedData.vendor,
        invoiceNumber: extractedData.invoiceNumber,
        date: extractedData.date,
        subtotal: extractedData.subtotal,
        tax: extractedData.tax,
        total: extractedData.total,
        lineItems: extractedData.lineItems
      }
    };
    
    sendSSE(res, 'agent_action', { 
      agent: 'Policy Agent', 
      message: `Found ${violations.length} policy violation(s). Flagging for human-in-the-loop approval.` 
    });
    
    // Send human intervention required event
    if (!interventionId) {
      console.error('Policy Agent: interventionId is missing when violations detected');
      sendSSE(res, 'error', { 
        agent: 'Policy Agent', 
        message: 'Failed to create intervention - missing interventionId' 
      });
    } else {
      sendSSE(res, 'human_intervention_required', {
        agent: 'Policy Agent',
        interventionId: interventionId,
        violations: violations,
        correctiveActions: correctiveActions,
        extractedData: interventionData.extractedData || {},
        message: 'Policy Agent detected policy violations that require human approval'
      });
    }
  }
  
  const policyResult = {
    checks,
    violations,
    correctiveActions,
    approved: violations.length === 0,
    requiresIntervention: requiresIntervention
  };
  
  sendSSE(res, 'agent_result', { agent: 'Policy Agent', result: policyResult });
  
  // Only mark as complete if no intervention is required
  if (!requiresIntervention) {
    sendSSE(res, 'agent_complete', { agent: 'Policy Agent' });
  } else {
    sendSSE(res, 'agent_action', { agent: 'Policy Agent', message: 'Waiting for human review and approval...' });
  }
  
  return { policyResult, reasoning, requiresIntervention, interventionData };
}

// Agent 4: GL Mapper Agent
async function glMapperAgent(extractedData, model, res) {
  sendSSE(res, 'agent_start', { agent: 'GL Mapper Agent', step: 4 });
  
  // Mock GL codes
  const glCodes = {
    'OFFICE_SUPPLIES': '6001',
    'SOFTWARE': '6002',
    'CONSULTING': '6003',
    'TRAVEL': '6004',
    'UTILITIES': '6005',
    'RENT': '6006',
    'MARKETING': '6007',
    'OTHER': '6999'
  };
  
  // Reasoning phase
  const reasoningPrompt = `You need to predict the General Ledger (GL) code for this invoice. Available codes:
${Object.entries(glCodes).map(([name, code]) => `- ${name}: ${code}`).join('\n')}

Think about:
1. What type of expense does this invoice represent?
2. Which GL code best matches the vendor and line items?
3. What contextual clues in the invoice help you decide?
4. Consider historical patterns - what GL codes have been used for similar vendors/expenses in the past?`;
  
  const dataContext = JSON.stringify(extractedData, null, 2);
  const reasoning = await streamReasoning(model, `${reasoningPrompt}\n\nInvoice Data:\n${dataContext}`, null, res, 'GL Mapper Agent', 'Reasoning');
  
  // Action phase
  sendSSE(res, 'agent_action', { agent: 'GL Mapper Agent', message: 'Predicting GL code based on invoice context and historical patterns...' });
  
  const mappingPrompt = `Based on the invoice data and historical context, predict the GL code. Return JSON:
{
  "glCode": "code",
  "glCategory": "category name",
  "confidence": number (0-100),
  "reasoning": "explanation of why this code was chosen, including any historical context used"
}`;
  
  const mappingResult = await model.generateContent([`${mappingPrompt}\n\nInvoice Data:\n${dataContext}`]);
  const mappingText = mappingResult.response.text();
  
  let glMapping = { glCode: '6999', glCategory: 'OTHER', confidence: 50, reasoning: 'Default mapping' };
  let usedHistoricalContext = false;
  
  try {
    const jsonMatch = mappingText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      glMapping = JSON.parse(jsonMatch[0]);
      // Check if reasoning mentions historical context
      if (glMapping.reasoning && (
        glMapping.reasoning.toLowerCase().includes('historical') ||
        glMapping.reasoning.toLowerCase().includes('previous') ||
        glMapping.reasoning.toLowerCase().includes('past') ||
        glMapping.reasoning.toLowerCase().includes('similar')
      )) {
        usedHistoricalContext = true;
      }
    }
  } catch (e) {
    // Fallback: try to infer from vendor/description
    const vendorLower = (extractedData.vendor || '').toLowerCase();
    const descriptionLower = (extractedData.lineItems?.[0]?.description || '').toLowerCase();
    
    if (vendorLower.includes('office') || descriptionLower.includes('supply')) {
      glMapping = { glCode: '6001', glCategory: 'OFFICE_SUPPLIES', confidence: 70, reasoning: 'Inferred from vendor/description' };
    } else if (vendorLower.includes('software') || descriptionLower.includes('software')) {
      glMapping = { glCode: '6002', glCategory: 'SOFTWARE', confidence: 70, reasoning: 'Inferred from vendor/description' };
    }
  }
  
  // Add historical context flag to mapping
  glMapping.usedHistoricalContext = usedHistoricalContext;
  
  sendSSE(res, 'agent_result', { agent: 'GL Mapper Agent', result: glMapping });
  
  sendSSE(res, 'agent_complete', { agent: 'GL Mapper Agent' });
  
  return { glMapping, reasoning, usedHistoricalContext };
}

// Agent 5: Quality Agent (The Self-Corrector)
async function qualityAgent(extractedData, model, res, imageData, mimeType, interventionId = null) {
  sendSSE(res, 'agent_start', { agent: 'Quality Agent', step: 5 });
  
  // Reasoning phase
  const reasoningPrompt = `You are the Quality Agent - the validator. Your job is to:
1. Mathematically verify tax and totals
2. Check for calculation errors
3. Verify data consistency
4. If errors are found, flag them for human-in-the-loop review (do not auto-correct)

Think about what calculations you need to verify.`;
  
  const dataContext = JSON.stringify(extractedData, null, 2);
  const reasoning = await streamReasoning(model, `${reasoningPrompt}\n\nCurrent Extracted Data:\n${dataContext}`, null, res, 'Quality Agent', 'Reasoning');
  
  // Action phase - Mathematical verification
  sendSSE(res, 'agent_action', { agent: 'Quality Agent', message: 'Verifying calculations and data integrity...' });
  
  const errors = [];
  const warnings = [];
  let selfCorrected = false;
  let correctionDetails = null;
  let requiresIntervention = false;
  let interventionData = null;
  
  // Verify line items sum
  if (extractedData.lineItems && Array.isArray(extractedData.lineItems)) {
    const calculatedSubtotal = extractedData.lineItems.reduce((sum, item) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);
    
    const subtotalDiff = Math.abs(calculatedSubtotal - (extractedData.subtotal || 0));
    if (subtotalDiff > 0.01) {
      errors.push(`Subtotal mismatch: Calculated ${calculatedSubtotal.toFixed(2)}, Found ${extractedData.subtotal}`);
    }
  }
  
  // Verify tax calculation
  if (extractedData.subtotal && extractedData.taxRate !== undefined) {
    const calculatedTax = extractedData.subtotal * extractedData.taxRate;
    const taxDiff = Math.abs(calculatedTax - (extractedData.tax || 0));
    if (taxDiff > 0.01) {
      errors.push(`Tax calculation error: Calculated ${calculatedTax.toFixed(2)}, Found ${extractedData.tax}`);
    }
  }
  
  // Verify total
  if (extractedData.subtotal && extractedData.tax !== undefined) {
    const calculatedTotal = extractedData.subtotal + extractedData.tax;
    const totalDiff = Math.abs(calculatedTotal - (extractedData.total || 0));
    if (totalDiff > 0.01) {
      errors.push(`Total mismatch: Calculated ${calculatedTotal.toFixed(2)}, Found ${extractedData.total}`);
    }
  }
  
  // If errors found, flag for human intervention instead of auto-correcting
  if (errors.length > 0) {
    const originalTotal = extractedData.total;
    
    sendSSE(res, 'agent_action', { 
      agent: 'Quality Agent', 
      message: `Found ${errors.length} calculation error(s). Flagging for human-in-the-loop intervention.` 
    });
    
    requiresIntervention = true;
    interventionData = {
      errors: Array.isArray(errors) ? errors : [],
      extractedData: {
        vendor: extractedData.vendor,
        invoiceNumber: extractedData.invoiceNumber,
        date: extractedData.date,
        subtotal: extractedData.subtotal,
        tax: extractedData.tax,
        total: extractedData.total,
        lineItems: extractedData.lineItems
      }
    };
    
    // Send human intervention required event
    // Ensure interventionId is set
    if (!interventionId) {
      console.error('Quality Agent: interventionId is missing when errors detected');
      sendSSE(res, 'error', { 
        agent: 'Quality Agent', 
        message: 'Failed to create intervention - missing interventionId' 
      });
    } else {
      sendSSE(res, 'human_intervention_required', {
        agent: 'Quality Agent',
        interventionId: interventionId,
        errors: Array.isArray(errors) ? errors : [],
        extractedData: interventionData.extractedData || {},
        message: 'Quality Agent detected calculation errors that require human review'
      });
    }
    
    // Store intervention data for later use
    warnings.push(`Human intervention required: ${errors.length} calculation error(s) detected`);
  } else {
    sendSSE(res, 'agent_action', { agent: 'Quality Agent', message: 'All calculations verified. No errors found.' });
  }
  
  const qualityResult = {
    verified: errors.length === 0,
    errors,
    warnings,
    correctionsApplied: false, // No auto-corrections, only human intervention
    selfCorrected: false, // No self-correction, only human intervention
    correctionDetails: null,
    requiresIntervention: requiresIntervention
  };
  
  sendSSE(res, 'agent_result', { agent: 'Quality Agent', result: qualityResult });
  
  // Only mark as complete if no intervention is required
  // If intervention is required, we'll mark it complete after user decision
  if (!requiresIntervention) {
    sendSSE(res, 'agent_complete', { agent: 'Quality Agent' });
  } else {
    // Don't mark complete yet - wait for human decision
    sendSSE(res, 'agent_action', { agent: 'Quality Agent', message: 'Waiting for human review and decision...' });
  }
  
  return { qualityResult, reasoning, finalData: extractedData, selfCorrected: false, correctionDetails: null, requiresIntervention, interventionData };
}

// Agent 6: Publisher Agent
async function publisherAgent(finalData, glMapping, policyResult, model, res, agenticDecisions) {
  sendSSE(res, 'agent_start', { agent: 'Publisher Agent', step: 6 });
  
  // Reasoning phase
  const reasoningPrompt = `You need to format the final invoice data for Google Sheets. Think about:
1. What format will be most useful in a spreadsheet?
2. How should nested data (like line items) be structured?
3. What metadata should be included (GL code, policy status, etc.)?`;
  
  const dataContext = JSON.stringify({ finalData, glMapping, policyResult }, null, 2);
  const reasoning = await streamReasoning(model, `${reasoningPrompt}\n\nData to format:\n${dataContext}`, null, res, 'Publisher Agent', 'Reasoning');
  
  // Action phase
  sendSSE(res, 'agent_action', { agent: 'Publisher Agent', message: 'Formatting final payload for Google Sheets...' });
  
  // Format for Google Sheets (flattened structure)
  const sheetsPayload = {
    timestamp: new Date().toISOString(),
    vendor: finalData.vendor,
    invoiceNumber: finalData.invoiceNumber,
    date: finalData.date,
    dueDate: finalData.dueDate,
    subtotal: finalData.subtotal,
    tax: finalData.tax,
    taxRate: finalData.taxRate,
    total: finalData.total,
    currency: finalData.currency || 'USD',
    glCode: glMapping.glCode,
    glCategory: glMapping.glCategory,
    policyApproved: policyResult.approved,
    policyViolations: policyResult.violations.length,
    correctiveActions: policyResult.correctiveActions.map(ca => ca.action).join('; '),
    lineItemsCount: finalData.lineItems?.length || 0,
    lineItems: finalData.lineItems?.map((item, idx) => ({
      row: idx + 1,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount
    })) || []
  };
  
  sendSSE(res, 'agent_result', { agent: 'Publisher Agent', result: sheetsPayload });
  
  // Simulate Google Sheets append operation
  sendSSE(res, 'agent_action', { agent: 'Publisher Agent', message: 'Connecting to Google Sheets API...' });
  
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  sendSSE(res, 'agent_action', { agent: 'Publisher Agent', message: 'Appending row to spreadsheet...' });
  
  // Simulate append operation
  const sheetId = '1a2b3c4d5e6f7g8h9i0j'; // Mock sheet ID
  const sheetName = 'Invoice_Processing';
  const rowData = [
    sheetsPayload.timestamp,
    sheetsPayload.vendor,
    sheetsPayload.invoiceNumber,
    sheetsPayload.date,
    sheetsPayload.dueDate,
    sheetsPayload.subtotal,
    sheetsPayload.tax,
    sheetsPayload.taxRate,
    sheetsPayload.total,
    sheetsPayload.currency,
    sheetsPayload.glCode,
    sheetsPayload.glCategory,
    sheetsPayload.policyApproved ? 'Yes' : 'No',
    sheetsPayload.policyViolations,
    sheetsPayload.lineItemsCount
  ];
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  sendSSE(res, 'agent_result', { 
    agent: 'Publisher Agent', 
    result: {
      ...sheetsPayload,
      sheetsAppend: {
        success: true,
        sheetId,
        sheetName,
        rowNumber: Math.floor(Math.random() * 1000) + 1, // Simulated row number
        timestamp: new Date().toISOString()
      }
    }
  });
  
  sendSSE(res, 'agent_complete', { agent: 'Publisher Agent' });
  
  // Send final complete payload with agentic decisions
  sendSSE(res, 'workflow_complete', { 
    payload: sheetsPayload,
    agenticDecisions: agenticDecisions || []
  });
  
  return { sheetsPayload, reasoning };
}

// SSE endpoint for workflow streaming
app.post('/api/workflow/stream', async (req, res) => {
  try {
    const { image } = req.body;

    // Validate input
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    if (!genAI) {
      return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Handle base64 image
    let imageData;
    let mimeType = 'image/png'; // default

    if (typeof image === 'string') {
      // Check if it's a data URL
      if (image.startsWith('data:')) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          imageData = matches[2];
        } else {
          // Assume it's just base64
          imageData = image;
        }
      } else {
        // Assume it's base64 without data URL prefix
        imageData = image;
      }
    } else {
      return res.status(400).json({ error: 'Image must be a base64 string' });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');

    // Initialize Gemini model (try Gemini-2.5-Flash first, then fallback)
    let model;
    try {
      model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    } catch (e) {
      try {
        model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      } catch (e2) {
        try {
          model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        } catch (e3) {
          model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        }
      }
    }

    sendSSE(res, 'workflow_start', { message: 'Starting 6-agent workflow' });

    // Track agentic decisions throughout the workflow
    const agenticDecisions = [];

    // Agent 1: Intake Agent
    const { intakeResult } = await intakeAgent(imageData, mimeType, imageBuffer, model, res);

    // Agent 2: Extraction Agent
    const { extractedData } = await extractionAgent(imageData, mimeType, model, res);

    // Generate unique intervention ID for Policy Agent
    const policyInterventionId = `intervention_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Agent 3: Policy Agent (may flag for human intervention)
    const { policyResult, requiresIntervention: policyRequiresIntervention, interventionData: policyInterventionData } = await policyAgent(extractedData, model, res, policyInterventionId);
    
    // If policy intervention is required, pause workflow and wait for user decision
    if (policyRequiresIntervention && policyInterventionData) {
      // Store workflow state for resumption
      pendingInterventions.set(policyInterventionId, {
        extractedData,
        policyResult,
        agenticDecisions,
        imageData,
        mimeType,
        model,
        res,
        interventionData: policyInterventionData,
        stage: 'policy' // Track which stage we're at
      });
      
      // Send intervention ID to frontend
      sendSSE(res, 'intervention_pending', {
        interventionId: policyInterventionId,
        message: 'Workflow paused. Waiting for policy approval...'
      });
      
      // Don't proceed until user makes a decision
      return;
    }

    // Agent 4: GL Mapper Agent
    const { glMapping, usedHistoricalContext } = await glMapperAgent(extractedData, model, res);
    
    // Track GL mapping decision if historical context was used
    if (usedHistoricalContext) {
      agenticDecisions.push({
        agent: 'GL Mapper',
        decision: 'Automated GL mapping based on historical context',
        details: `Mapped to ${glMapping.glCategory} (${glMapping.glCode}) using historical patterns and vendor context`,
        confidence: glMapping.confidence
      });
    }

    // Generate unique intervention ID
    const interventionId = `intervention_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Agent 5: Quality Agent (may flag for human intervention)
    const { finalData, selfCorrected, correctionDetails, requiresIntervention, interventionData } = await qualityAgent(extractedData, model, res, imageData, mimeType, interventionId);
    
    // If human intervention is required, pause workflow and wait for user decision
    if (requiresIntervention && interventionData) {
      // Store workflow state for resumption
      pendingInterventions.set(interventionId, {
        extractedData: finalData,
        glMapping,
        policyResult,
        agenticDecisions,
        imageData,
        mimeType,
        model,
        res,
        interventionData,
        stage: 'quality' // Track which stage we're at
      });
      
      // Send intervention ID to frontend
      sendSSE(res, 'intervention_pending', {
        interventionId,
        message: 'Workflow paused. Waiting for human decision...'
      });
      
      // Don't proceed until user makes a decision
      return;
    }
    
    // Track self-correction decision if it occurred (for future use if we add auto-correction back)
    if (selfCorrected && correctionDetails) {
      agenticDecisions.push({
        agent: 'Quality',
        decision: 'Self-corrected total amount',
        details: `Detected calculation errors (${correctionDetails.errorsFound.length} issue(s)) and automatically corrected via feedback loop. Original total: $${correctionDetails.originalTotal}, Corrected total: $${correctionDetails.correctedTotal}`,
        impact: 'Data accuracy improved through autonomous correction'
      });
    }

    // Agent 6: Publisher Agent
    await publisherAgent(finalData, glMapping, policyResult, model, res, agenticDecisions);

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error in /api/workflow/stream:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      sendSSE(res, 'error', { message: error.message, stack: error.stack });
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    }
  }
});

// API endpoint to handle human intervention decision
app.post('/api/workflow/intervention', async (req, res) => {
  try {
    const { interventionId, decision, correctedData } = req.body;

    if (!interventionId || !decision) {
      return res.status(400).json({ error: 'interventionId and decision are required' });
    }

    const intervention = pendingInterventions.get(interventionId);
    if (!intervention) {
      return res.status(404).json({ error: 'Intervention not found or already processed' });
    }

    const { extractedData, glMapping, policyResult, agenticDecisions, imageData, mimeType, model, res: originalRes, interventionData: storedInterventionData, stage } = intervention;

    if (decision === 'accept') {
      if (stage === 'policy') {
        // Policy intervention - user approved policy violations
        sendSSE(originalRes, 'intervention_decision', {
          decision: 'accepted',
          message: 'User approved policy violations. Proceeding with workflow...'
        });

        // Mark Policy Agent as complete
        sendSSE(originalRes, 'agent_complete', { agent: 'Policy Agent' });

        // Track the human decision
        agenticDecisions.push({
          agent: 'Policy',
          decision: 'Human-in-the-loop: Approved policy violations',
          details: `User reviewed and approved invoice despite ${storedInterventionData.violations?.length || 0} policy violation(s). Invoice total: $${extractedData.total}`,
          impact: 'Workflow continued with user approval'
        });

        // Continue with GL Mapper Agent and rest of workflow
        const { glMapping: continuedGlMapping, usedHistoricalContext } = await glMapperAgent(extractedData, model, originalRes);
        
        // Track GL mapping decision if historical context was used
        if (usedHistoricalContext) {
          agenticDecisions.push({
            agent: 'GL Mapper',
            decision: 'Automated GL mapping based on historical context',
            details: `Mapped to ${continuedGlMapping.glCategory} (${continuedGlMapping.glCode}) using historical patterns and vendor context`,
            confidence: continuedGlMapping.confidence
          });
        }

        // Generate unique intervention ID for Quality Agent
        const qualityInterventionId = `intervention_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Continue with Quality Agent
        const { finalData, requiresIntervention: qualityRequiresIntervention, interventionData: qualityInterventionData } = await qualityAgent(extractedData, model, originalRes, imageData, mimeType, qualityInterventionId);
        
        // If Quality Agent also requires intervention, pause again
        if (qualityRequiresIntervention && qualityInterventionData) {
          pendingInterventions.set(qualityInterventionId, {
            extractedData: finalData,
            glMapping: continuedGlMapping,
            policyResult,
            agenticDecisions,
            imageData,
            mimeType,
            model,
            res: originalRes,
            interventionData: qualityInterventionData,
            stage: 'quality'
          });
          
          sendSSE(originalRes, 'intervention_pending', {
            interventionId: qualityInterventionId,
            message: 'Workflow paused. Waiting for quality review...'
          });
          return;
        }

        // Continue with Publisher Agent
        await publisherAgent(finalData, continuedGlMapping, policyResult, model, originalRes, agenticDecisions);

      } else {
        // Quality intervention - user accepted the data despite errors
        sendSSE(originalRes, 'intervention_decision', {
          decision: 'accepted',
          message: 'User accepted data with errors. Proceeding with workflow...'
        });

        // Mark Quality Agent as complete now that user has made decision
        sendSSE(originalRes, 'agent_complete', { agent: 'Quality Agent' });

        // Track the human decision
        agenticDecisions.push({
          agent: 'Quality',
          decision: 'Human-in-the-loop: Accepted data with errors',
          details: `User reviewed and accepted invoice data despite ${storedInterventionData.errors?.length || 0} calculation error(s). Original total: $${extractedData.total}`,
          impact: 'Workflow continued with user approval'
        });

        // Continue with Publisher Agent
        await publisherAgent(extractedData, glMapping, policyResult, model, originalRes, agenticDecisions);
      }

      originalRes.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      originalRes.end();

    } else if (decision === 'decline') {
      // User declined - stop workflow
      const agentName = stage === 'policy' ? 'Policy Agent' : 'Quality Agent';
      
      sendSSE(originalRes, 'intervention_decision', {
        decision: 'declined',
        message: `User declined to proceed. Workflow stopped.`
      });

      // Mark appropriate agent as complete (with declined status)
      sendSSE(originalRes, 'agent_complete', { agent: agentName });

      sendSSE(originalRes, 'workflow_stopped', {
        reason: stage === 'policy' 
          ? 'User declined to approve policy violations' 
          : 'User declined to proceed with data containing errors'
      });

      originalRes.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      originalRes.end();
    } else {
      return res.status(400).json({ error: 'Invalid decision. Must be "accept" or "decline"' });
    }

    // Remove from pending interventions
    pendingInterventions.delete(interventionId);

    res.json({ success: true, message: `Workflow ${decision === 'accept' ? 'continued' : 'stopped'}` });

  } catch (error) {
    console.error('Error handling intervention:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  if (!genAI) {
    console.warn('Warning: GOOGLE_API_KEY not configured. Using mock responses.');
  }
});

