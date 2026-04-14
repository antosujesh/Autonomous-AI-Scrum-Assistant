const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const tools = [
    {
        type: "function",
        function: {
            name: "sendMessage",
            description: "Send a WhatsApp message to a specific phone number.",
            parameters: {
                type: "object",
                properties: {
                    phoneNumber: {
                        type: "string",
                        description: "The phone number with country code (e.g., 91XXXXXXXXXX).",
                    },
                    text: {
                        type: "string",
                        description: "The message content to send.",
                    },
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
                    skillName: {
                        type: "string",
                        description: "The name of the new skill (e.g., 'Return Policy').",
                    },
                    description: {
                        type: "string",
                        description: "Short summary of what the skill covers.",
                    },
                    content: {
                        type: "string",
                        description: "The actual instructions or rules that the AI should follow when this skill is enabled.",
                    }
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
                    status: {
                        type: "string",
                        enum: ["Pending", "In Progress", "Completed"],
                        description: "The new status of the task.",
                    },
                    comment: {
                        type: "string",
                        description: "The summary of the update or remark provided by the user.",
                    },
                    reDueDate: {
                        type: "string",
                        description: "The new requested due date in ISO format (YYYY-MM-DD HH:mm). Only use this if the user explicitly asks to reschedule or provides a new date.",
                    }
                },
                required: ["status"],
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
                    assignToPersonId: {
                        type: "integer",
                        description: "The internal ID of the team member to assign the task to (you MUST determine this from the available team members provided in your system prompt).",
                    },
                    description: {
                        type: "string",
                        description: "The detailed explanation of what the task entails.",
                    },
                    dueDate: {
                        type: "string",
                        description: "The deadline for the task in ISO format (YYYY-MM-DD HH:mm). Calculate this dynamically based on what the user asks (e.g. 'tomorrow 5pm').",
                    }
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
                    code: {
                        type: "string",
                        description: "The JavaScript code to execute. Standard Node.js library modules may not be available. Use 'console.log()' to return visible output.",
                    },
                },
                required: ["code"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "searchWeb",
            description: "Search the web for real-time information, news, or current events using Google/Bing via a scraper.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query to look for.",
                    },
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
                    url: {
                        type: "string",
                        description: "The full URL of the page to read.",
                    },
                },
                required: ["url"],
            },
        },
    }
];

async function getAIResponse(userMessage, history = []) {
    const { getEnabledSkills } = require('./db');
    const enabledSkills = await getEnabledSkills();

    let skillsContext = "";
    if (enabledSkills.length > 0) {
        skillsContext = "\nYou have the following specialized skills/SOPs available to help you answer or perform actions:\n";
        enabledSkills.forEach(skill => {
            skillsContext += `- Skill: ${skill.Name}\n  Instructions: ${skill.Content}\n`;
        });
    }

    const { getAllSettings } = require('./db');
    const settings = await getAllSettings();

    const messages = [
        { 
            role: "system", 
            content: `You are a helpful WhatsApp AI agent managing tasks and Daily Scrums.${skillsContext}
- Use 'updateTaskStatus' when a user provides an update on a task.
- If a user says they are working on it but it's not done, set status to 'In Progress'.
- If they specify a new date or say "reschedule to [date]", capture the 'reDueDate'.
- IMPORTANT: If a task is being postponed but the user didn't specify a new date, ASK them: "When would you like to reschedule this to?"
- SECURITY: Only the authorized Admin (whose number is in settings) can use 'createSkill'. If anyone else tries, explain that they need to contact the admin.
- PERMISSIONS: Your code execution tool (executeCode) has the following policy settings:
  * File Write: ${settings.CodeExecution_AllowWrite === 'true' ? 'ENABLED' : 'DISABLED'}
  * Record Delete: ${settings.CodeExecution_AllowDelete === 'true' ? 'ENABLED' : 'DISABLED'}
  * Record Edit: ${settings.CodeExecution_AllowEdit === 'true' ? 'ENABLED' : 'DISABLED'}
- Be concise and professional.` 
        },
        ...history
    ];

    if (userMessage) {
        messages.push({ role: "user", content: userMessage });
    }

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
    });

    return response.choices[0].message;
}

module.exports = { getAIResponse, openai };
