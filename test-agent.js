const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  console.log('Agent taking control of authenticated profile...');
  
  const browser = await puppeteer.launch({
    headless: false, // Keep it false so you can watch it work!
    executablePath: '/usr/bin/google-chrome', 
    userDataDir: './auth-profile', // Uses the human-generated session
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  console.log('Navigating to Gmail...');
  await page.goto('https://mail.google.com', { waitUntil: 'networkidle2' });
  
  console.log('Taking screenshot to prove we are in...');
  await page.screenshot({ path: 'we-are-in.png' });

  console.log('Success! Closing browser in 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
