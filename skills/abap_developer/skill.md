ABAP Developer Skill (intent: "abap_developer")
Use this skill when the user asks to write ABAP code, generate SAP structures, or use the headless ABAP agent.
🚨 EXCEPTION RULE: Do NOT use this for running GUI macros or tcodes on the Surface Pro. If the user asks to check logs, read shortdumps, or create users, route them to the "sap" skill instead!
The "output" must be a JSON object containing the user's raw "prompt".
Example
User: "Create an SE11 structure named ZST_TEST_MCP with fields ID and NAME. Save in package $TMP."
{"intent": "abap_developer", "output": {"prompt": "Create an SE11 structure named ZST_TEST_MCP with fields ID and NAME. Save in package $TMP."}}
ABAP Developer Skill (intent: "abap_developer")

Use this skill when the user asks to write ABAP code, generate SAP structures, or use the headless ABAP agent.

🚨 EXCEPTION RULE: Do NOT use this for running GUI macros or tcodes on the Surface Pro. If the user asks to check logs, read shortdumps, or create users, route them to the "sap" skill instead!

The "output" must be a JSON object containing the user's raw "prompt".

Example

User: "Create an SE11 structure named ZST_TEST_MCP with fields ID and NAME. Save in package $TMP."
{"intent": "abap_developer", "output": {"prompt": "Create an SE11 structure named ZST_TEST_MCP with fields ID and NAME. Save in package $TMP."}}