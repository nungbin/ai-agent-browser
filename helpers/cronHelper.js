// File: helpers/cronHelper.js
const cron = require('node-cron');
const activeJobs = new Map();
let executeTaskCallback;

exports.init = (callback) => {
    executeTaskCallback = callback;
};

exports.addJob = (cronExpression, task, chatId) => {
    if (!cron.validate(cronExpression)) throw new Error("Invalid Cron format.");
    const id = Date.now().toString().substring(7);
    const job = cron.schedule(cronExpression, () => executeTaskCallback(chatId, task, true));
    activeJobs.set(id, { job, expression: cronExpression, task });
    return id;
};

exports.removeJob = (id) => {
    if (activeJobs.has(id)) {
        activeJobs.get(id).job.stop();
        activeJobs.delete(id);
        return `✅ Task <code>${id}</code> deleted.`;
    }
    return `❌ Task <code>${id}</code> not found.`;
};

exports.listJobs = () => {
    if (activeJobs.size === 0) return "No active tasks.";
    let res = "⏰ <b>Scheduled Tasks:</b>\n";
    activeJobs.forEach((val, key) => {
        res += `\n<b>ID:</b> <code>${key}</code>\n<b>Cron:</b> ${val.expression}\n<b>Task:</b> ${val.task}\n`;
    });
    return res;
};