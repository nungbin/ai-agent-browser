const { spawn } = require('child_process');
const io = require('socket.io-client');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const linuxBrainIP = 'http://192.168.1.243:3000'; 
console.log(`📡 Connecting to Linux Brain at ${linuxBrainIP}...`);

const socket = io(linuxBrainIP, { reconnection: true });

socket.on('connect', () => console.log("✅ LINK ESTABLISHED!"));

socket.on('execute_sap', async (payload) => {
    // 🌐 HANDLE WEB RPA (PUPPETEER)
    if (payload.type === 'BATCH_DASHBOARD_TESTING') {
        await runBrowserAutomation(payload, socket);
        return;
    }

    // 🪟 HANDLE DESKTOP RPA (VBSCRIPT)
    // We determine which .vbs to run based on the payload.
    // If payload.vbs_file is provided, use it. Default to 'surgeon.vbs'.
    const scriptFile = payload.vbs_file || 'surgeon.vbs';
    
    // Prepare arguments for VBScript. 
    // We use an array so we can add as many as the specific script needs.
    const args = ['//nologo', scriptFile, payload.username, payload.password, payload.tcode];
    
    // Append extra params if they exist (for SU01 / SE38 / SE11)
    if (payload.target_user) args.push(payload.target_user);
    if (payload.target_pass) args.push(payload.target_pass);
    if (payload.program_name) args.push(payload.program_name); // For SE38
    if (payload.struct_name) args.push(payload.struct_name);   // For SE11

    socket.emit('status_update', `Spawning VBS Surgeon: ${scriptFile} for ${payload.tcode}...`);

    const surgeon = spawn('cscript', args);

    surgeon.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) socket.emit('status_update', output);
    });

    surgeon.stderr.on('data', (data) => {
        socket.emit('status_update', `⚠️ VBS Error: ${data.toString()}`);
    });

    surgeon.on('close', (code) => {
        socket.emit('task_complete', { 
            status: code === 0 ? "Success" : "Failed",
            script: scriptFile 
        });
    });
});

async function runBrowserAutomation(batchData, socket) {
    const tasks = batchData.tasks || [];
    const baseUrl = batchData.url;

    socket.emit('status_update', `Launching Chrome for ${tasks.length} tasks...`);
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null, 
        args: ['--start-maximized'] 
    });

    const page = await browser.newPage();

    try {
        page.setDefaultTimeout(45000); 
        await page.goto(baseUrl, { waitUntil: 'networkidle2' });

        const physicalClick = async (text) => {
            const coords = await page.evaluate((txt) => {
                const query = txt.toLowerCase().trim();
                const elements = Array.from(document.querySelectorAll('button, [role="button"], span, b, div')).reverse();
                let target = elements.find(el => (el.innerText || "").toLowerCase().trim() === query && el.offsetWidth > 0);
                if (!target) target = elements.find(el => (el.innerText || "").toLowerCase().includes(query) && el.offsetWidth > 0);
                
                if (target) {
                    const btn = target.closest('button') || target.closest('[role="button"]') || target;
                    const rect = (btn || target).getBoundingClientRect();
                    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, found: true };
                }
                return { found: false };
            }, text);

            if (!coords.found) throw new Error(`Could not find button: ${text}`);
            
            await page.mouse.move(coords.x, coords.y, { steps: 5 });
            await page.mouse.down();
            await new Promise(r => setTimeout(r, 150)); 
            await page.mouse.up();
            await new Promise(r => setTimeout(r, 1500));
        };

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            socket.emit('status_update', `[${i+1}/${tasks.length}] Updating ${task.year}...`);

            try {
                await physicalClick("Navigation");
                await new Promise(r => setTimeout(r, 1000)); 
            } catch (e) {
                console.log("Navigation button not found, assuming sidebar is already open.");
            }

            await physicalClick(task.year.toString());
            socket.emit('status_update', `Waiting for ${task.year} data to load...`);
            await new Promise(r => setTimeout(r, 2500)); 

            await physicalClick("Edit Mode");
            
            socket.emit('status_update', `Locating 'Job title' on screen...`);
            const inputCoords = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                const targetLabel = elements.find(el => {
                    const txt = (el.innerText || "").toLowerCase().trim();
                    return txt === 'job title' || txt === 'job title:';
                });

                if (targetLabel) {
                    const labelRect = targetLabel.getBoundingClientRect();
                    const labelCenterY = labelRect.top + labelRect.height / 2;
                    const inputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetWidth > 0);
                    
                    let closestInput = null;
                    let minDiff = Infinity;

                    for (const input of inputs) {
                        const iRect = input.getBoundingClientRect();
                        const iCenterY = iRect.top + iRect.height / 2;
                        const yDiff = Math.abs(iCenterY - labelCenterY);
                        if (yDiff < 30 && iRect.left > labelRect.left) {
                            if (yDiff < minDiff) {
                                minDiff = yDiff;
                                closestInput = input;
                            }
                        }
                    }

                    if (closestInput) {
                        closestInput.scrollIntoView({ block: 'center' });
                        const rect = closestInput.getBoundingClientRect();
                        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, found: true };
                    }
                }
                return { found: false };
            });

            if (!inputCoords.found) throw new Error("Could not visually match the Job Title input box.");

            await page.mouse.click(inputCoords.x, inputCoords.y, { clickCount: 1 }); 
            await new Promise(r => setTimeout(r, 200));
            
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await page.keyboard.press('ArrowRight');
            await new Promise(r => setTimeout(r, 100));
            
            await page.keyboard.type(" " + task.jobTitle, { delay: 60 }); 
            
            await page.keyboard.press('Enter');
            await page.keyboard.press('Tab');
            await new Promise(r => setTimeout(r, 1000));

            await physicalClick("Save to Sheet");
            
            try {
                await page.waitForFunction(() => {
                    const toast = document.querySelector('.sapMMessageToast');
                    return toast && toast.innerText.toLowerCase().includes('saved');
                }, { timeout: 8000 });
                socket.emit('status_update', `✅ ${task.year} Appended & Saved!`);
            } catch (e) {
                socket.emit('status_update', `⚠️ ${task.year} appended (toast skipped).`);
            }
            
            await new Promise(r => setTimeout(r, 2000));
        }

        socket.emit('status_update', `All tasks finished.`);
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
        socket.emit('task_complete', { status: "Success" });

    } catch (err) {
        const screenPath = path.join(__dirname, 'rpa_failure.png');
        await page.screenshot({ path: screenPath });
        socket.emit('status_update', `❌ Error: ${err.message}`);
        socket.emit('task_complete', { status: "Failed", error: err.message });
        if (browser) await browser.close();
    }
}