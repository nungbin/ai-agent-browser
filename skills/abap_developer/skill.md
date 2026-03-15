"abap_developer": Use this skill when the user asks to write ABAP code, generate SAP structures, or use the headless ABAP agent.
RULE: Do NOT use this for running GUI macros or tcodes on the Surface Pro.
RULE: The "output" must be a JSON object containing the user's "prompt".
EXAMPLE: {"intent": "abap_developer", "output": {"prompt": "Create an SE11 structure named ZST_TEST_MCP with fields ID and NAME. Save in package $TMP."}}
