const { google } = require('googleapis');

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; 

async function appendToSheet(dataString) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: './credentials.json', 
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:B',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[new Date().toLocaleString(), dataString]]
      },
    });

    return `✅ Successfully logged "${dataString}" to Google Sheets!`;
  } catch (error) {
    console.error(error);
    return `❌ Failed to write to Google Sheets. Did you set up credentials.json?`;
  }
}

module.exports = { appendToSheet };