// File: agents/cronAgent.js
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

const CRON_FILE = path.join(__dirname, '../cron_jobs.json');

let activeTasks = {}; 
let savedJobs = {};   

async function init(pipelineCallback) {
    try {
        const data = await fs.readFile(CRON_FILE, 'utf8');
        savedJobs = JSON.parse(data);
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
    if (activeTasks[id]) activeTasks[id].stop();
    activeTasks[id] = cron.schedule(cronExp, () => pipelineCallback(chatId, task, true));
}

async function addJob(cronExp, task, chatId, pipelineCallback) {
    if (!cron.validate(cronExp)) throw new Error(`Invalid cron expression: ${cronExp}`);

    const id = Date.now().toString().slice(-6); 
    savedJobs[id] = { cronExp, task, chatId };
    
    startCronTask(id, cronExp, task, chatId, pipelineCallback);
    await save();
    
    return id;
}

async function removeJob(keyword) {
    if (savedJobs[keyword]) {
        activeTasks[keyword].stop();
        delete activeTasks[keyword];
        delete savedJobs[keyword];
        await save();
        return `✅ Job <b>#${keyword}</b> removed successfully.`;
    }

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