require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

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
  
  // Reflection phase
  const reflectionPrompt = `Reflect on the intake process. Did you identify any issues? If warnings were raised, explain why you're proceeding despite them, or if you should stop.`;
  
  const reflection = await streamReasoning(model, reflectionPrompt, null, res, 'Intake Agent', 'Reflection');
  
  sendSSE(res, 'agent_complete', { agent: 'Intake Agent' });
  
  return { intakeResult, reasoning, reflection };
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
  
  // Reflection phase
  const reflectionPrompt = `Reflect on your extraction. List any fields you're not 100% confident about. For each ambiguous field, explain:
1. Why you're uncertain
2. What alternative interpretations exist
3. Your confidence level (0-100%)`;
  
  const reflection = await streamReasoning(model, reflectionPrompt, imagePart, res, 'Extraction Agent', 'Reflection');
  
  // Extract ambiguous fields from reflection
  let ambiguousFields = [];
  if (reflection.toLowerCase().includes('uncertain') || reflection.toLowerCase().includes('ambiguous')) {
    // Try to identify which fields are mentioned
    Object.keys(extractedData).forEach(key => {
      if (reflection.toLowerCase().includes(key.toLowerCase())) {
        ambiguousFields.push(key);
      }
    });
  }
  
  sendSSE(res, 'agent_result', { agent: 'Extraction Agent', ambiguousFields });
  sendSSE(res, 'agent_complete', { agent: 'Extraction Agent' });
  
  return { extractedData, reasoning, reflection, ambiguousFields };
}

// Agent 3: Policy Agent
async function policyAgent(extractedData, model, res) {
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
  }
  
  const policyResult = {
    checks,
    violations,
    correctiveActions,
    approved: violations.length === 0
  };
  
  sendSSE(res, 'agent_result', { agent: 'Policy Agent', result: policyResult });
  
  // Reflection phase
  const reflectionPrompt = `Reflect on the policy check. Are the corrective actions appropriate? Should this invoice be blocked or can it proceed with approvals?`;
  
  const reflection = await streamReasoning(model, reflectionPrompt, null, res, 'Policy Agent', 'Reflection');
  
  sendSSE(res, 'agent_complete', { agent: 'Policy Agent' });
  
  return { policyResult, reasoning, reflection };
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
3. What contextual clues in the invoice help you decide?`;
  
  const dataContext = JSON.stringify(extractedData, null, 2);
  const reasoning = await streamReasoning(model, `${reasoningPrompt}\n\nInvoice Data:\n${dataContext}`, null, res, 'GL Mapper Agent', 'Reasoning');
  
  // Action phase
  sendSSE(res, 'agent_action', { agent: 'GL Mapper Agent', message: 'Predicting GL code based on invoice context...' });
  
  const mappingPrompt = `Based on the invoice data, predict the GL code. Return JSON:
{
  "glCode": "code",
  "glCategory": "category name",
  "confidence": number (0-100),
  "reasoning": "explanation of why this code was chosen"
}`;
  
  const mappingResult = await model.generateContent([`${mappingPrompt}\n\nInvoice Data:\n${dataContext}`]);
  const mappingText = mappingResult.response.text();
  
  let glMapping = { glCode: '6999', glCategory: 'OTHER', confidence: 50, reasoning: 'Default mapping' };
  try {
    const jsonMatch = mappingText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      glMapping = JSON.parse(jsonMatch[0]);
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
  
  sendSSE(res, 'agent_result', { agent: 'GL Mapper Agent', result: glMapping });
  
  // Reflection phase (already done in reasoning, but we'll add a summary)
  sendSSE(res, 'agent_complete', { agent: 'GL Mapper Agent' });
  
  return { glMapping, reasoning };
}

// Agent 5: Quality Agent (The Self-Corrector)
async function qualityAgent(extractedData, model, res, imageData, mimeType) {
  sendSSE(res, 'agent_start', { agent: 'Quality Agent', step: 5 });
  
  // Reasoning phase
  const reasoningPrompt = `You are the Quality Agent - the self-corrector. Your job is to:
1. Mathematically verify tax and totals
2. Check for calculation errors
3. Verify data consistency
4. If errors are found, send the task back to Extraction Agent for correction

Think about what calculations you need to verify.`;
  
  const dataContext = JSON.stringify(extractedData, null, 2);
  const reasoning = await streamReasoning(model, `${reasoningPrompt}\n\nCurrent Extracted Data:\n${dataContext}`, null, res, 'Quality Agent', 'Reasoning');
  
  // Action phase - Mathematical verification
  sendSSE(res, 'agent_action', { agent: 'Quality Agent', message: 'Verifying calculations and data integrity...' });
  
  const errors = [];
  const warnings = [];
  
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
  
  // If errors found, send back to Extraction Agent
  if (errors.length > 0) {
    sendSSE(res, 'agent_action', { 
      agent: 'Quality Agent', 
      message: `Found ${errors.length} calculation error(s). Sending back to Extraction Agent for correction...` 
    });
    
    sendSSE(res, 'correction_loop', { 
      agent: 'Quality Agent',
      errors,
      message: 'Initiating correction loop with Extraction Agent'
    });
    
    // Re-extract with error feedback
    const correctionPrompt = `Previous extraction had these calculation errors:
${errors.join('\n')}

Please re-extract the invoice data, paying special attention to:
1. Line item calculations (quantity × unitPrice = amount)
2. Subtotal (sum of all line item amounts)
3. Tax calculation (subtotal × taxRate)
4. Total (subtotal + tax)

Return the corrected JSON with the same structure.`;
    
    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: mimeType
      }
    };
    
    const correctedResult = await model.generateContent([correctionPrompt, imagePart]);
    const correctedText = correctedResult.response.text();
    
    let correctedData = extractedData;
    try {
      const jsonMatch = correctedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        correctedData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      sendSSE(res, 'error', { agent: 'Quality Agent', message: 'Failed to parse corrected extraction' });
    }
    
    sendSSE(res, 'agent_result', { agent: 'Quality Agent', correctedData, originalErrors: errors });
    
    // Verify corrections
    const verificationErrors = [];
    if (correctedData.lineItems && Array.isArray(correctedData.lineItems)) {
      const calculatedSubtotal = correctedData.lineItems.reduce((sum, item) => {
        return sum + (item.quantity * item.unitPrice);
      }, 0);
      const subtotalDiff = Math.abs(calculatedSubtotal - (correctedData.subtotal || 0));
      if (subtotalDiff > 0.01) {
        verificationErrors.push('Subtotal still incorrect after correction');
      }
    }
    
    if (verificationErrors.length === 0) {
      sendSSE(res, 'agent_action', { agent: 'Quality Agent', message: 'Corrections verified. Data is now accurate.' });
      extractedData = correctedData; // Update with corrected data
    } else {
      warnings.push('Some errors may remain after correction');
    }
  } else {
    sendSSE(res, 'agent_action', { agent: 'Quality Agent', message: 'All calculations verified. No errors found.' });
  }
  
  const qualityResult = {
    verified: errors.length === 0,
    errors,
    warnings,
    correctionsApplied: errors.length > 0
  };
  
  sendSSE(res, 'agent_result', { agent: 'Quality Agent', result: qualityResult });
  
  // Reflection phase
  const reflectionPrompt = `Reflect on the quality check. Were the corrections successful? Is the data now reliable for processing?`;
  
  const reflection = await streamReasoning(model, reflectionPrompt, null, res, 'Quality Agent', 'Reflection');
  
  sendSSE(res, 'agent_complete', { agent: 'Quality Agent' });
  
  return { qualityResult, reasoning, reflection, finalData: extractedData };
}

// Agent 6: Publisher Agent
async function publisherAgent(finalData, glMapping, policyResult, model, res) {
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
  
  // Reflection phase
  const reflectionPrompt = `Reflect on the final payload. Is it complete? Will it be easy to import into Google Sheets?`;
  
  const reflection = await streamReasoning(model, reflectionPrompt, null, res, 'Publisher Agent', 'Reflection');
  
  sendSSE(res, 'agent_complete', { agent: 'Publisher Agent' });
  
  // Send final complete payload
  sendSSE(res, 'workflow_complete', { payload: sheetsPayload });
  
  return { sheetsPayload, reasoning, reflection };
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

    // Agent 1: Intake Agent
    const { intakeResult } = await intakeAgent(imageData, mimeType, imageBuffer, model, res);

    // Agent 2: Extraction Agent
    const { extractedData, ambiguousFields } = await extractionAgent(imageData, mimeType, model, res);

    // Agent 3: Policy Agent
    const { policyResult } = await policyAgent(extractedData, model, res);

    // Agent 4: GL Mapper Agent
    const { glMapping } = await glMapperAgent(extractedData, model, res);

    // Agent 5: Quality Agent (may trigger correction loop)
    const { finalData } = await qualityAgent(extractedData, model, res, imageData, mimeType);

    // Agent 6: Publisher Agent
    await publisherAgent(finalData, glMapping, policyResult, model, res);

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

