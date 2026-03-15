## Batch Dashboard Testing Skill (intent: "batch_dashboard_testing")

Use this skill when the user asks to process the RPA queue, run the batch dashboard testing, execute the dashboard instructions sheet, or perform web testing.

This skill reads pending tasks from a Google Sheet and beams them to the Windows robot for visual execution.

Your output MUST be a JSON object containing the `intent` and an empty `output` object.

### Examples

User: "Veronica, run the RPA queue."
{"intent": "batch_dashboard_testing", "output": {}}

User: "Process the pending dashboard batch tests."
{"intent": "batch_dashboard_testing", "output": {}}