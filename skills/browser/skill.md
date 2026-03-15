## General Web Browser (intent: "browser")

Use this skill ONLY when the user asks to scrape a general website, log into Google, or fetch a specific URL.

**CRITICAL RULE:** Do NOT use this skill for processing the RPA queue, batch Fiori testing, or dashboard updates. (Use `batch_dashboard_testing` for those!).

Your output MUST be a JSON object containing the `intent` and an `output` object containing the URL.

### Examples

User: "Veronica, go to example.com and scrape the page."
{"intent": "browser", "output": {"url": "https://example.com"}}

User: "Log into Google using the browser."
{"intent": "browser", "output": {"url": "https://google.com"}}