const { spawn } = require('child_process');
const io = require('socket.io-client');

// CHANGE THIS TO YOUR LINUX LXC IP!
const linuxBrainIP = 'http://192.168.1.243:3000'; 

console.log(`📡 Connecting to Linux Brain at ${linuxBrainIP}...`);

// Keep our aggressive auto-reconnect logic
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
    
    // Tell Linux we are starting
    socket.emit('status_update', `Starting task for user: ${payload.target_user}...`);
    
    // SPAWN the VBScript with 5 dynamic arguments!
    const surgeon = spawn('cscript', [
        '//nologo', 'surgeon.vbs', 
        payload.username, 
        payload.password, 
        payload.tcode,
        payload.target_user,  // DYNAMIC USER
        payload.target_pass   // DYNAMIC PASSWORD
    ]);

    // Intercept standard output and stream it to Linux
    surgeon.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            // Split by newlines in case VBScript spits out a block of text
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

    // When the VBScript finishes completely
    surgeon.on('close', (code) => {
        console.log(`✅ Surgeon exited. Task Complete!`);
        
        // SEND THE FINAL PAYLOAD BACK TO LINUX
        socket.emit('task_complete', { 
            user: payload.target_user,      // DYNAMIC RETURN
            password: payload.target_pass,  // DYNAMIC RETURN
            status: code === 0 ? "Success" : "Failed"
        });
    });
});

socket.on('disconnect', (reason) => {
    console.log(`⚠️ LINK LOST: ${reason}. Attempting to reconnect...`);
});