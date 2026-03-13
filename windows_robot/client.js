const { spawn } = require('child_process');
const io = require('socket.io-client');

// CHANGE THIS TO YOUR LINUX LXC IP!
const linuxBrainIP = 'http://192.168.1.243:3000'; 

console.log(`📡 Connecting to Linux Brain at ${linuxBrainIP}...`);

const socket = io(linuxBrainIP, {
    reconnection: true,             
    reconnectionDelay: 2000,        
    reconnectionDelayMax: 10000     
});

socket.on('connect', () => {
    console.log("✅ LINK ESTABLISHED! Listening for JSON payloads...");
});

socket.on('execute_sap', (payload) => {
    console.log(`\n📥 Payload Received! Target T-Code: ${payload.tcode}`);
    
    let scriptName = '';
    let args = [];

    // 🌟 THE SCRIPT ROUTER 🌟
    if (payload.tcode === 'SU01') {
        scriptName = 'surgeon.vbs';
        args = ['//nologo', scriptName, payload.username, payload.password, payload.tcode, payload.target_user, payload.target_pass];
        socket.emit('status_update', `Starting SU01 task for user: ${payload.target_user}...`);
    } else if (payload.tcode === 'SE38') {
        scriptName = 'se38_creator.vbs';
        args = ['//nologo', scriptName, payload.username, payload.password, payload.tcode, payload.program_name];
        socket.emit('status_update', `Starting SE38 task for program: ${payload.program_name}...`);
    } else {
        socket.emit('status_update', `❌ ERROR: Unsupported T-Code requested (${payload.tcode}).`);
        socket.emit('task_complete', { status: "Failed" });
        return;
    }

    const surgeon = spawn('cscript', args);

    surgeon.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            const lines = output.split('\n');
            lines.forEach(line => {
                const cleanLine = line.trim();
                if (cleanLine) {
                    console.log(cleanLine);
                    socket.emit('status_update', cleanLine);
                }
            });
        }
    });

    surgeon.stderr.on('data', (data) => {
        console.error(`❌ ERROR: ${data}`);
        socket.emit('status_update', `ERROR: ${data}`);
    });

    surgeon.on('close', (code) => {
        console.log(`✅ Script ${scriptName} exited. Task Complete!`);
        socket.emit('task_complete', { 
            user: payload.target_user,
            password: payload.target_pass,
            program: payload.program_name,
            status: code === 0 ? "Success" : "Failed"
        });
    });
});

socket.on('disconnect', (reason) => {
    console.log(`⚠️ LINK LOST: ${reason}. Attempting to reconnect...`);
});