const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

const CRON_FILE = path.join(__dirname, '../cron_jobs.json');

// Memory stores
let activeTasks = {}; // Stores the actual running node-cron instances
let savedJobs = {};   // Stores the configuration for saving to disk

async function init(pipelineCallback) {
    try {
        const data = await fs.readFile(CRON_FILE, 'utf8');
        savedJobs = JSON.parse(data);
        
        // Restart all saved jobs on boot
        for (const [id, job] of Object.entries(savedJobs)) {
            startCronTask(id, job.cronExp, job.task, job.chatId, pipelineCallback);
        }
        console.log(`⏰ Cron Agent Loaded: ${Object.keys(savedJobs).length} jobs active.`);
    } catch (e) {
        console.log('⏰ No previous cron jobs found. Starting fresh.');
        savedJobs = {};
    }
}

async function save() {
    await fs.writeFile(CRON_FILE, JSON.stringify(savedJobs, null, 2), 'utf8');
}

function startCronTask(id, cronExp, task, chatId, pipelineCallback) {
    // Stop it if it's already running just in case
    if (activeTasks[id]) activeTasks[id].stop();
    
    activeTasks[id] = cron.schedule(cronExp, () => {
        // Trigger the main bot pipeline exactly as if the user typed it
        pipelineCallback(chatId, task, true); 
    });
}

async function addJob(cronExp, task, chatId, pipelineCallback) {
    // Validate the cron expression
    if (!cron.validate(cronExp)) {
        throw new Error(`Invalid cron expression: ${cronExp}`);
    }

    const id = Date.now().toString().slice(-6); // Create a short 6-digit ID
    savedJobs[id] = { cronExp, task, chatId };
    
    startCronTask(id, cronExp, task, chatId, pipelineCallback);
    await save();
    
    return id;
}

async function removeJob(keyword) {
    // Search by ID first
    if (savedJobs[keyword]) {
        activeTasks[keyword].stop();
        delete activeTasks[keyword];
        delete savedJobs[keyword];
        await save();
        return `✅ Job <b>#${keyword}</b> removed successfully.`;
    }

    // Search by task description (fuzzy match)
    for (const [id, job] of Object.entries(savedJobs)) {
        if (job.task.toLowerCase().includes(keyword.toLowerCase())) {
            activeTasks[id].stop();
            delete activeTasks[id];
            delete savedJobs[id];
            await save();
            return `✅ Cancelled job <b>#${id}</b> ("${job.task}").`;
        }
    }

    return `❌ Could not find a job matching "<b>${keyword}</b>". Use /jobs to see active IDs.`;
}

function listJobs() {
    const jobs = Object.entries(savedJobs);
    if (jobs.length === 0) return "<i>No active cron jobs.</i>";
    
    let text = "⏰ <b>Active Scheduled Jobs:</b>\n\n";
    jobs.forEach(([id, job]) => {
        text += `<b>ID:</b> <code>${id}</code>\n<b>Schedule:</b> <pre>${job.cronExp}</pre>\n<b>Task:</b> ${job.task}\n\n`;
    });
    return text;
}

module.exports = { init, addJob, removeJob, listJobs };