const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');


const tools = [
    {
        type: "function",
        function: {
            name: "sendMessage",
            description: "Send a WhatsApp message to a specific phone number.",
            parameters: {
                type: "object",
                properties: {
                    phoneNumber: { type: "string", description: "The phone number with country code (e.g., 91XXXXXXXXXX)." },
                    text: { type: "string", description: "The message content to send." },
                },
                required: ["phoneNumber", "text"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "createSkill",
            description: "Register a new skill or capability (SOP) for the agent. This allows the admin to change organizational logic dynamically.",
            parameters: {
                type: "object",
                properties: {
                    skillName: { type: "string", description: "The name of the new skill (e.g., 'Return Policy')." },
                    description: { type: "string", description: "Short summary of what the skill covers." },
                    content: { type: "string", description: "The actual instructions or rules that the AI should follow when this skill is enabled." }
                },
                required: ["skillName", "description", "content"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "updateTaskStatus",
            description: "Update the status of a task based on user input. Use this when a user provides an update, finishes a task, or reschedules it.",
            parameters: {
                type: "object",
                properties: {
                    taskId: { type: "integer", description: "The unique ID of the task to update. You MUST find this from the list provided in the context." },
                    status: { type: "string", enum: ["Pending", "In Progress", "Completed"], description: "The new status of the task." },
                    comment: { type: "string", description: "The summary of the update or remark provided by the user." },
                    reDueDate: { type: "string", description: "The new requested due date in ISO format (YYYY-MM-DD HH:mm). Only use this if the user explicitly asks to reschedule or provides a new date." }
                },
                required: ["taskId", "status"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "createTask",
            description: "Assign a new task to a team member. You MUST ask the user for both the Assignee and the Due Date if they did not provide them in their initial request.",
            parameters: {
                type: "object",
                properties: {
                    assignToPersonId: { type: "integer", description: "The internal ID of the team member to assign the task to." },
                    description: { type: "string", description: "The detailed explanation of what the task entails." },
                    dueDate: { type: "string", description: "The deadline for the task in ISO format (YYYY-MM-DD HH:mm)." },
                    projectId: { type: "integer", description: "Optional. The ID of the project to associate this task with. Find IDs from the AVAILABLE PROJECTS list in your system prompt." },
                    priority: { type: "integer", description: "Optional. 1=Low, 2=Medium, 3=High, 4=Urgent. Default is 2." },
                    estimateHours: { type: "number", description: "Optional. Estimated time in hours to complete the task." }
                },
                required: ["assignToPersonId", "description", "dueDate"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "executeCode",
            description: "Execute JavaScript code in a safe Node.js environment. Use this for complex calculations, data processing, or logical tasks.",
            parameters: {
                type: "object",
                properties: {
                    code: { type: "string", description: "The JavaScript code to execute." },
                },
                required: ["code"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "searchWeb",
            description: "Search the web for real-time information, news, or current events.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search query to look for." },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "browseWeb",
            description: "Read the content of a specific web page (URL).",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The full URL of the page to read." },
                },
                required: ["url"],
            },
        },
    }
];

async function getProviderConfig() {
    const { getAllSettings } = require('./db');
    const settings = await getAllSettings();
    return {
        provider: settings.AI_Provider || 'OpenAI',
        openAiKey: settings.OpenAI_ApiKey,
        geminiKey: settings.Gemini_ApiKey,
        openAiModel: settings.OpenAI_Model || 'gpt-4o',
        geminiModel: settings.Gemini_Model || 'gemini-1.5-flash'
    };
}

async function getAIResponse(userMessage, history = []) {
    const { getAllSettings } = require('./db');
    const settings = await getAllSettings();
    const config = await getProviderConfig();

    const systemPrompt = `You are a helpful WhatsApp AI agent managing tasks and Daily Scrums.
- Use 'updateTaskStatus' when a user provides an update on a task.
- If a user says they are working on it but it's not done, set status to 'In Progress'.
- If they specify a new date or say "reschedule to [date]", capture the 'reDueDate'.
- IMPORTANT: If a task is being postponed but the user didn't specify a new date, ASK them: "When would you like to reschedule this to?"
- SECURITY: Only authorized Privileged Users (Admins) can use 'createSkill'. If a regular member tries, explain that they need to contact the admin via the dashboard.
- PERMISSIONS: Your code execution tool (executeCode) has the following policy settings:
  * File Write: ${settings.CodeExecution_AllowWrite === 'true' ? 'ENABLED' : 'DISABLED'}
  * Record Delete: ${settings.CodeExecution_AllowDelete === 'true' ? 'ENABLED' : 'DISABLED'}
  * Record Edit: ${settings.CodeExecution_AllowEdit === 'true' ? 'ENABLED' : 'DISABLED'}
- Be concise and professional.`;

    if (config.provider === 'Gemini') {
        return getGeminiResponse(userMessage, history, systemPrompt, config.geminiKey, config.geminiModel);
    } else {
        return getOpenAIResponse(userMessage, history, systemPrompt, config.openAiKey, config.openAiModel);
    }
}

async function getOpenAIResponse(userMessage, history, systemPrompt, apiKey, modelName) {
    const openai = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
    const messages = [
        { role: "system", content: systemPrompt },
        ...history
    ];

    if (userMessage) {
        messages.push({ role: "user", content: userMessage });
    }

    const response = await openai.chat.completions.create({
        model: modelName || "gpt-4o",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
    });

    return response.choices[0].message;
}

async function getGeminiResponse(userMessage, history, systemPrompt, apiKey, modelName) {
    const genAI = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
        model: modelName || "gemini-1.5-flash",
        systemInstruction: systemPrompt 
    });

    // Translate tools to Gemini format
    const geminiTools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters
    }));

    // Translate history to Gemini format
    const geminiHistory = [];
    let currentRole = null;
    let currentParts = [];

    // History needs to be alternating user/model
    history.forEach(msg => {
        if (msg.role === 'system') return; // Handled by systemInstruction
        
        const role = (msg.role === 'user' || msg.role === 'tool') ? 'user' : 'model';
        const text = msg.content || "";
        
        if (msg.role === 'assistant' && msg.tool_calls) {
            // Assistant tool call part
            geminiHistory.push({
                role: 'model',
                parts: msg.tool_calls.map(tc => ({
                    functionCall: {
                        name: tc.function.name,
                        args: JSON.parse(tc.function.arguments)
                    }
                }))
            });
        } else if (msg.role === 'tool') {
            // Tool response part
            geminiHistory.push({
                role: 'user',
                parts: [{
                    functionResponse: {
                        name: history.find(h => h.tool_call_id === msg.tool_call_id)?.function?.name || "", 
                        response: { content: msg.content }
                    }
                }]
            });
        } else {
            geminiHistory.push({
                role: role,
                parts: [{ text: text }]
            });
        }
    });

    const chat = model.startChat({
        history: geminiHistory,
        tools: [{ functionDeclarations: geminiTools }]
    });

    const result = await chat.sendMessage(userMessage);
    const response = result.response;
    const content = response.candidates[0].content;
    
    // Normalize to OpenAI format
    const normalized = {
        role: 'assistant',
        content: null
    };

    const textPart = content.parts.find(p => p.text);
    if (textPart) normalized.content = textPart.text;

    const toolParts = content.parts.filter(p => p.functionCall);
    if (toolParts.length > 0) {
        normalized.tool_calls = toolParts.map((tp, idx) => ({
            id: `call_${Date.now()}_${idx}`,
            type: 'function',
            function: {
                name: tp.functionCall.name,
                arguments: JSON.stringify(tp.functionCall.args)
            }
        }));
    }

    return normalized;
}

module.exports = { getAIResponse };
